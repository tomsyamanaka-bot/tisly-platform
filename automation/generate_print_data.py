#!/usr/bin/env python3
"""
AIものづくり自動化 - 印刷データ生成バケツリレー（ベース）

パイプライン:
  1. OpenSCAD  : .scad  -> .stl
  2. CuraEngine: .stl   -> .gcode
  3. TiSLY Print Models API へアップロード
  4. OctoPrint / Moonraker へ G-code 送信＋印刷開始

使い方:
  python generate_print_data.py samples/cube.scad
  python generate_print_data.py path/to/model.scad --skip-upload --skip-print
  python generate_print_data.py path/to/model.scad -o output/custom_name
  python generate_print_data.py path/to/model.scad --skip-upload --start-print

環境変数（任意・未設定時は下記 DEFAULT_* を使用）:
  OPENSCAD_PATH, CURAENGINE_PATH, CURA_DEFINITION, CURA_EXTRUDER
  CURA_ENGINE_SEARCH_PATH, TISLY_PRINT_API_URL / TISLY_KNOWLEDGE_API_URL,
  TISLY_PRINT_UPLOAD_TOKEN,
  PRINTER_API_URL, PRINTER_API_KEY, PRINTER_BACKEND (octoprint|moonraker|auto),
  PRINTER_AUTO_START, PRINTER_DRY_RUN, PRINTER_VERIFY_SSL
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import ssl
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request
from urllib.request import Request

DEFAULT_TISLY_PRINT_API_URL = "http://127.0.0.1:3080/api/print-models/v1/upload"

# ---------------------------------------------------------------------------
# ツールパス (このPCにインストール済みの既定値)
# 環境変数で上書き可能
# ---------------------------------------------------------------------------
_CURA_ROOT = Path(r"C:\Program Files\UltiMaker Cura 5.13.0")
_CURA_DEFINITIONS = _CURA_ROOT / "share" / "cura" / "resources" / "definitions"
_CURA_EXTRUDERS = _CURA_ROOT / "share" / "cura" / "resources" / "extruders"

DEFAULT_OPENSCAD = Path(r"C:\Program Files\OpenSCAD\openscad.exe")
DEFAULT_CURAENGINE = _CURA_ROOT / "CuraEngine.exe"
# CLI 単体では機種固有 def の継承解決が不完全なため、
# fdmprinter / fdmextruder + 明示設定を既定とする（機種切替は後で拡張可能）
DEFAULT_CURA_DEFINITION = _CURA_DEFINITIONS / "fdmprinter.def.json"
DEFAULT_CURA_EXTRUDER = _CURA_DEFINITIONS / "fdmextruder.def.json"
DEFAULT_CURA_SEARCH_PATH = f"{_CURA_DEFINITIONS};{_CURA_EXTRUDERS}"

# CuraEngine CLI で必要になる最低限のスライス設定（後から上書き可）
DEFAULT_SLICE_SETTINGS: dict[str, str] = {
    "machine_width": "220",
    "machine_depth": "220",
    "machine_height": "250",
    "machine_center_is_zero": "false",
    "machine_heated_bed": "true",
    "machine_nozzle_size": "0.4",
    "layer_height": "0.2",
    "layer_height_0": "0.3",
    "wall_line_count": "2",
    "top_layers": "4",
    "bottom_layers": "4",
    "infill_sparse_density": "20",
    "roofing_layer_count": "0",
    "flooring_layer_count": "0",
    "material_diameter": "1.75",
    "material_print_temperature": "200",
    "material_bed_temperature": "60",
    "material_print_temperature_layer_0": "210",
    "material_bed_temperature_layer_0": "60",
    "retraction_enable": "true",
    "retraction_amount": "5",
    "retraction_speed": "45",
    "adhesion_type": "skirt",
}

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIR = SCRIPT_DIR / "output"
_ENV_LOADED = False


# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------
def _env_truthy(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def load_env_files(*, force: bool = False) -> list[Path]:
    """
    automation/.env → リポジトリルート .env → server/.env を読み込む。
    既に OS 環境変数にあるキーは上書きしない（シェル設定を優先）。
    """
    global _ENV_LOADED
    if _ENV_LOADED and not force:
        return []
    _ENV_LOADED = True

    candidates = [
        SCRIPT_DIR / ".env",
        SCRIPT_DIR.parent / ".env",
        SCRIPT_DIR.parent / "server" / ".env",
    ]
    loaded: list[Path] = []
    for path in candidates:
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"[env] 読み込み失敗: {path} ({exc})", file=sys.stderr)
            continue
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if not key or key.startswith("#"):
                continue
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            if key not in os.environ:
                os.environ[key] = value
        loaded.append(path)
    return loaded


def _env_path(name: str, default: Path) -> Path:
    raw = os.environ.get(name, "").strip()
    return Path(raw) if raw else default


def _ssl_context() -> ssl.SSLContext | None:
    """PRINTER_VERIFY_SSL=false のとき自己署名証明書を許容する。"""
    if _env_truthy("PRINTER_VERIFY_SSL", "true"):
        return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _http_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
    timeout_sec: float = 120.0,
) -> dict[str, Any]:
    """HTTP リクエストを送り、JSON（または raw）を dict にまとめる。"""
    req_headers = {
        "Accept": "application/json",
        "User-Agent": "TiSLY-print-automation/1.0",
        **(headers or {}),
    }
    req = Request(url, data=data, headers=req_headers, method=method.upper())
    try:
        with request.urlopen(req, timeout=timeout_sec, context=_ssl_context()) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            try:
                parsed: Any = json.loads(body) if body else {}
            except json.JSONDecodeError:
                parsed = {"raw": body}
            return {
                "ok": True,
                "status": getattr(resp, "status", 200),
                "response": parsed,
            }
    except error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        try:
            parsed_err: Any = json.loads(err_body) if err_body else {}
        except json.JSONDecodeError:
            parsed_err = {"raw": err_body}
        return {
            "ok": False,
            "status": exc.code,
            "error": f"http_{exc.code}",
            "response": parsed_err,
            "detail": err_body[:2000],
        }
    except error.URLError as exc:
        return {
            "ok": False,
            "error": "connection_failed",
            "detail": str(exc.reason if hasattr(exc, "reason") else exc),
        }


def _encode_multipart(
    fields: dict[str, str],
    files: dict[str, tuple[str, bytes, str]],
) -> tuple[bytes, str]:
    """stdlib だけで multipart/form-data を組み立てる。"""
    boundary = f"----TislyPrinterBoundary{uuid.uuid4().hex}"
    body = bytearray()

    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8")
        )
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")

    for name, (filename, content, content_type) in files.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            (
                f'Content-Disposition: form-data; name="{name}"; '
                f'filename="{filename}"\r\n'
            ).encode("utf-8")
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(content)
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def _normalize_printer_base_url(api_url: str) -> str:
    return api_url.strip().rstrip("/")


def resolve_printer_backend(api_url: str, backend: str | None = None) -> str:
    """
    PRINTER_BACKEND:
      - octoprint / moonraker / auto（既定）
    auto は URL パスや既定ポートから推定する。
    """
    raw = (backend or os.environ.get("PRINTER_BACKEND", "auto") or "auto").strip().lower()
    if raw in {"octoprint", "octo", "op"}:
        return "octoprint"
    if raw in {"moonraker", "klipper", "mainsail", "fluidd"}:
        return "moonraker"
    if raw not in {"", "auto"}:
        raise ValueError(
            f"未対応の PRINTER_BACKEND: {raw} "
            "(対応: octoprint / moonraker / auto)"
        )

    lower = api_url.lower()
    if any(token in lower for token in ("/server/", "moonraker", "7125")):
        return "moonraker"
    if any(token in lower for token in ("octoprint", ":5000", "/api/files")):
        return "octoprint"
    # Creality / Bambu ブリッジの多くは Moonraker 互換
    if any(token in lower for token in ("creality", "bambu")):
        return "moonraker"
    return "octoprint"


def resolve_printer_api_key() -> str:
    for name in (
        "PRINTER_API_KEY",
        "OCTOPRINT_API_KEY",
        "MOONRAKER_API_KEY",
    ):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def _run(
    cmd: list[str],
    *,
    label: str,
    env: dict[str, str] | None = None,
) -> None:
    """外部コマンドを実行し、失敗時は例外を投げる。"""
    print(f"[{label}] $ {' '.join(cmd)}")
    run_env = os.environ.copy()
    if env:
        run_env.update(env)

    try:
        completed = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=run_env,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"{label}: 実行ファイルが見つかりません: {cmd[0]}") from exc

    combined = "\n".join(
        part for part in (completed.stdout.strip(), completed.stderr.strip()) if part
    )
    if completed.returncode != 0:
        if combined:
            print(combined)
        raise RuntimeError(
            f"{label}: 終了コード {completed.returncode} "
            f"(command={' '.join(cmd)})"
        )

    # 成功時は要点だけ（OpenSCAD の Facets 行など）
    for line in combined.splitlines():
        lower = line.lower()
        if any(
            key in lower
            for key in ("facets:", "[error]", "progress:", "slicing model", "took ")
        ):
            print(line)


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def format_print_time_label(seconds: float | int | None) -> str | None:
    """秒数を『1時間51分』形式に整形する。"""
    if seconds is None:
        return None
    try:
        total = int(round(float(seconds)))
    except (TypeError, ValueError):
        return None
    if total < 0:
        return None
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}時間{m}分" if m else f"{h}時間"
    if m > 0:
        return f"{m}分{s}秒" if s else f"{m}分"
    return f"{s}秒"


def parse_gcode_slice_summary(
    gcode_path: Path,
    *,
    settings: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    G-code 先頭コメントと温度コマンドからスライス概要を抽出する。

    Cura の典型コメント:
      ;TIME:6666
      ;LAYER_COUNT:274
      ;Filament used: 0m
      ;Layer height: 0.2
    """
    settings = settings or {}
    summary: dict[str, Any] = {
        "printTimeSeconds": None,
        "printTimeLabel": None,
        "layerCount": None,
        "layerHeightMm": None,
        "nozzleTempC": None,
        "bedTempC": None,
        "filamentUsedM": None,
        "infillPercent": None,
        "nozzleSizeMm": None,
        "machineName": None,
        "material": None,
        "sourceFile": str(gcode_path),
    }

    if settings.get("infill_sparse_density"):
        try:
            summary["infillPercent"] = float(settings["infill_sparse_density"])
        except ValueError:
            pass
    if settings.get("machine_nozzle_size"):
        try:
            summary["nozzleSizeMm"] = float(settings["machine_nozzle_size"])
        except ValueError:
            pass
    if settings.get("layer_height"):
        try:
            summary["layerHeightMm"] = float(settings["layer_height"])
        except ValueError:
            pass
    if settings.get("material_print_temperature"):
        try:
            summary["nozzleTempC"] = float(settings["material_print_temperature"])
        except ValueError:
            pass
    if settings.get("material_bed_temperature"):
        try:
            summary["bedTempC"] = float(settings["material_bed_temperature"])
        except ValueError:
            pass

    if not gcode_path.is_file():
        return summary

    # 巨大 G-code でも先頭付近で十分（TIME / LAYER_COUNT / 初期温度）
    text = gcode_path.read_text(encoding="utf-8", errors="replace")[:120_000]

    m = re.search(r";\s*TIME\s*:\s*([\d.]+)", text, re.I)
    if m:
        summary["printTimeSeconds"] = int(round(float(m.group(1))))

    m = re.search(r";\s*LAYER_COUNT\s*:\s*(\d+)", text, re.I)
    if m:
        summary["layerCount"] = int(m.group(1))

    m = re.search(r";\s*Layer height\s*:\s*([\d.]+)", text, re.I)
    if m:
        summary["layerHeightMm"] = float(m.group(1))

    m = re.search(r";\s*Filament used\s*:\s*([\d.]+)\s*m", text, re.I)
    if m:
        summary["filamentUsedM"] = float(m.group(1))

    m = re.search(r";\s*TARGET_MACHINE\.NAME\s*:\s*(.+)", text, re.I)
    if m:
        name = m.group(1).strip()
        if name and name.lower() != "unknown":
            summary["machineName"] = name

    # 印刷温度はヒートアップ後の値を優先（M109 / M104 の最後）
    nozzle_temps = [float(x) for x in re.findall(r"\bM10[49]\s+S([\d.]+)", text)]
    bed_temps = [float(x) for x in re.findall(r"\bM1[49]0\s+S([\d.]+)", text)]
    if nozzle_temps:
        summary["nozzleTempC"] = nozzle_temps[-1]
    if bed_temps:
        summary["bedTempC"] = bed_temps[-1]

    summary["printTimeLabel"] = format_print_time_label(summary["printTimeSeconds"])
    return summary


def write_slice_json(path: Path, summary: dict[str, Any]) -> Path:
    _ensure_parent(path)
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[Slice] 概要JSON: {path}")
    return path


# ---------------------------------------------------------------------------
# Step 1: OpenSCAD - .scad -> .stl
# ---------------------------------------------------------------------------
def scad_to_stl(scad_path: Path, stl_path: Path, *, openscad: Path) -> Path:
    """
    OpenSCAD CLI で SCAD を STL に変換する。

    OpenSCAD:
      openscad.exe -o <out.stl> <in.scad>
    """
    if not scad_path.is_file():
        raise FileNotFoundError(f"SCAD ファイルがありません: {scad_path}")
    if not openscad.is_file():
        raise FileNotFoundError(
            f"OpenSCAD が見つかりません: {openscad}\n"
            "環境変数 OPENSCAD_PATH を設定するか、インストールを確認してください。"
        )

    _ensure_parent(stl_path)
    _run(
        [str(openscad), "-o", str(stl_path), str(scad_path)],
        label="OpenSCAD",
    )

    if not stl_path.is_file() or stl_path.stat().st_size == 0:
        raise RuntimeError(f"STL が生成されませんでした: {stl_path}")

    print(f"[OpenSCAD] STL 生成完了: {stl_path} ({stl_path.stat().st_size} bytes)")
    return stl_path


# ---------------------------------------------------------------------------
# Step 2: CuraEngine - .stl -> .gcode
# ---------------------------------------------------------------------------
def stl_to_gcode(
    stl_path: Path,
    gcode_path: Path,
    *,
    curaengine: Path,
    definition: Path,
    extruder: Path,
    search_path: str | None = None,
    extra_settings: dict[str, str] | None = None,
) -> Path:
    """
    CuraEngine で STL をスライスし G-code を生成する。

    典型コマンド:
      CuraEngine.exe slice -v
        -d <definitions;extruders>
        -j fdmprinter.def.json
        -s key=value ...
        -e0 -j fdmextruder.def.json
        -s extruder_nr=0 ...
        -l model.stl -o out.gcode
    """
    if not stl_path.is_file():
        raise FileNotFoundError(f"STL ファイルがありません: {stl_path}")
    if not curaengine.is_file():
        raise FileNotFoundError(
            f"CuraEngine が見つかりません: {curaengine}\n"
            "環境変数 CURAENGINE_PATH を設定するか、Cura のインストールを確認してください。"
        )
    if not definition.is_file():
        raise FileNotFoundError(f"プリンター定義がありません: {definition}")
    if not extruder.is_file():
        raise FileNotFoundError(f"エクストルーダー定義がありません: {extruder}")

    search = (
        search_path
        or os.environ.get("CURA_ENGINE_SEARCH_PATH", "").strip()
        or DEFAULT_CURA_SEARCH_PATH
    )

    settings = dict(DEFAULT_SLICE_SETTINGS)
    if extra_settings:
        settings.update(extra_settings)

    _ensure_parent(gcode_path)

    cmd: list[str] = [
        str(curaengine),
        "slice",
        "-d",
        search,
        "-j",
        str(definition),
    ]
    for key, value in settings.items():
        cmd.extend(["-s", f"{key}={value}"])

    cmd.extend(
        [
            "-e0",
            "-j",
            str(extruder),
            "-s",
            "extruder_nr=0",
            "-s",
            "machine_nozzle_offset_x=0",
            "-s",
            "machine_nozzle_offset_y=0",
            "-s",
            "machine_extruder_start_code=",
            "-s",
            "machine_extruder_end_code=",
            "-l",
            str(stl_path),
            "-o",
            str(gcode_path),
        ]
    )

    _run(
        cmd,
        label="CuraEngine",
        env={"CURA_ENGINE_SEARCH_PATH": search},
    )

    if not gcode_path.is_file() or gcode_path.stat().st_size == 0:
        raise RuntimeError(f"G-code が生成されませんでした: {gcode_path}")

    print(f"[CuraEngine] G-code 生成完了: {gcode_path} ({gcode_path.stat().st_size} bytes)")
    return gcode_path


# ---------------------------------------------------------------------------
# Step 3a: TiSLY Print Models API へアップロード
# ---------------------------------------------------------------------------
def resolve_tisly_print_api_url(api_url: str | None = None) -> str:
    """優先順: 引数 → TISLY_PRINT_API_URL → TISLY_KNOWLEDGE_API_URL → ローカル既定。"""
    for candidate in (
        api_url,
        os.environ.get("TISLY_PRINT_API_URL", ""),
        os.environ.get("TISLY_KNOWLEDGE_API_URL", ""),
        DEFAULT_TISLY_PRINT_API_URL,
    ):
        value = (candidate or "").strip()
        if value:
            return value
    return DEFAULT_TISLY_PRINT_API_URL


def upload_to_tisly(
    files: dict[str, Path],
    *,
    api_url: str | None = None,
    metadata: dict[str, Any] | None = None,
    slice_summary: dict[str, Any] | None = None,
    name: str | None = None,
    timeout_sec: float = 60.0,
) -> dict[str, Any]:
    """
    生成した STL（＋任意で G-code）とスライス概要 JSON を TiSLY へ POST する。

    エンドポイント例:
      POST /api/print-models/v1/upload
      Body (JSON):
        {
          "name": "s5m_pulley_50mm",
          "source": "automation",
          "slice": { "printTimeSeconds": 6666, "printTimeLabel": "1時間51分", ... },
          "stlFileName": "...stl",
          "stlBase64": "...",
          "gcodeFileName": "...gcode",   # optional
          "gcodeBase64": "..."           # optional
        }

    認証（任意）:
      環境変数 TISLY_PRINT_UPLOAD_TOKEN があれば Authorization: Bearer を付与。
    """
    api_url = resolve_tisly_print_api_url(api_url)
    stl_path = files.get("stl")
    gcode_path = files.get("gcode")
    payload_meta = {
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "files": {k: str(v) for k, v in files.items()},
        **(metadata or {}),
    }

    if stl_path is None or not Path(stl_path).is_file():
        return {
            "ok": False,
            "error": "stl_file_missing",
            "api_url": api_url,
            "meta": payload_meta,
        }

    stl_path = Path(stl_path)
    model_name = (name or stl_path.stem).strip() or stl_path.stem
    meta = metadata or {}
    body: dict[str, Any] = {
        "name": model_name,
        "source": str(meta.get("source") or "automation"),
        "notes": meta.get("notes"),
        "slice": slice_summary or meta.get("slice") or {},
        "stlFileName": stl_path.name,
        "stlBase64": base64.b64encode(stl_path.read_bytes()).decode("ascii"),
    }
    if meta.get("id"):
        body["id"] = str(meta["id"])

    if gcode_path and Path(gcode_path).is_file():
        gcode_path = Path(gcode_path)
        # 巨大 G-code は既定で送らない（メタだけで足りる）。明示指定時のみ。
        include_gcode = os.environ.get("TISLY_UPLOAD_GCODE", "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        if include_gcode:
            body["gcodeFileName"] = gcode_path.name
            body["gcodeBase64"] = base64.b64encode(gcode_path.read_bytes()).decode("ascii")
        else:
            body["slice"] = {
                **(body.get("slice") or {}),
                "gcodeLocalPath": str(gcode_path),
                "gcodeSizeBytes": gcode_path.stat().st_size,
            }

    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "User-Agent": "TiSLY-print-automation/1.0",
    }
    token = os.environ.get("TISLY_PRINT_UPLOAD_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-Tisly-Upload-Token"] = token

    raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    print(f"[TiSLY] POST {api_url} ({len(raw)} bytes, name={model_name})")
    print(f"[TiSLY] slice: {json.dumps(body.get('slice') or {}, ensure_ascii=False)}")

    req = request.Request(api_url, data=raw, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=timeout_sec) as resp:
            resp_body = resp.read().decode("utf-8", errors="replace")
            try:
                parsed: Any = json.loads(resp_body) if resp_body else {}
            except json.JSONDecodeError:
                parsed = {"raw": resp_body}
            result = {
                "ok": True,
                "status": getattr(resp, "status", 200),
                "api_url": api_url,
                "response": parsed,
                "meta": payload_meta,
            }
            viewer = None
            if isinstance(parsed, dict):
                viewer = parsed.get("viewerUrl")
                model = parsed.get("model") if isinstance(parsed.get("model"), dict) else None
                if model and model.get("id"):
                    result["modelId"] = model["id"]
            if viewer:
                print(f"[TiSLY] アップロード成功 → {viewer}")
            else:
                print("[TiSLY] アップロード成功")
            return result
    except error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        print(f"[TiSLY] HTTP {exc.code}: {err_body[:500]}", file=sys.stderr)
        return {
            "ok": False,
            "error": f"http_{exc.code}",
            "detail": err_body[:2000],
            "api_url": api_url,
            "meta": payload_meta,
        }
    except error.URLError as exc:
        print(f"[TiSLY] 接続失敗: {exc}", file=sys.stderr)
        return {
            "ok": False,
            "error": "connection_failed",
            "detail": str(exc.reason if hasattr(exc, "reason") else exc),
            "api_url": api_url,
            "meta": payload_meta,
        }


# ---------------------------------------------------------------------------
# Step 3b: 3Dプリンター Web API へ送信（OctoPrint / Moonraker）
# ---------------------------------------------------------------------------
def _send_octoprint(
    gcode_path: Path,
    *,
    base_url: str,
    api_key: str,
    start_print: bool,
    printer_id: str | None,
    timeout_sec: float,
) -> dict[str, Any]:
    """
    OctoPrint: POST /api/files/local （multipart）
    select/print フラグでアップロード直後に印刷開始可能。
    """
    upload_url = f"{base_url}/api/files/local"
    file_bytes = gcode_path.read_bytes()
    fields = {
        "select": "true",
        "print": "true" if start_print else "false",
    }
    if printer_id:
        # OctoPrint の path サブフォルダ（存在すれば）
        fields["path"] = printer_id.strip("/\\")

    body, content_type = _encode_multipart(
        fields,
        {
            "file": (
                gcode_path.name,
                file_bytes,
                "application/octet-stream",
            )
        },
    )
    headers = {
        "Content-Type": content_type,
        "X-Api-Key": api_key,
    }
    print(
        f"[Printer/OctoPrint] POST {upload_url} "
        f"({len(file_bytes)} bytes, start_print={start_print})"
    )
    upload = _http_json(
        "POST",
        upload_url,
        headers=headers,
        data=body,
        timeout_sec=timeout_sec,
    )
    if not upload.get("ok"):
        return {
            "ok": False,
            "backend": "octoprint",
            "api_url": upload_url,
            "step": "upload",
            **{k: v for k, v in upload.items() if k != "ok"},
        }

    # print=true で足りるが、失敗時や明示 start のフォールバック
    job_result: dict[str, Any] | None = None
    if start_print:
        # アップロード時 print=true 成功時は追加 start は不要。
        # ただしレスポンスに done/effectivePrint が無い環境向けに、
        # PRINTER_FORCE_JOB_START=true のときだけ /api/job を叩く。
        if _env_truthy("PRINTER_FORCE_JOB_START", "false"):
            job_url = f"{base_url}/api/job"
            job_body = json.dumps({"command": "start"}).encode("utf-8")
            print(f"[Printer/OctoPrint] POST {job_url} command=start")
            job_result = _http_json(
                "POST",
                job_url,
                headers={
                    "Content-Type": "application/json",
                    "X-Api-Key": api_key,
                },
                data=job_body,
                timeout_sec=timeout_sec,
            )
            if not job_result.get("ok"):
                return {
                    "ok": False,
                    "backend": "octoprint",
                    "api_url": job_url,
                    "step": "start",
                    "upload": upload,
                    **{k: v for k, v in job_result.items() if k != "ok"},
                }

    return {
        "ok": True,
        "backend": "octoprint",
        "api_url": upload_url,
        "uploaded": True,
        "print_started": start_print,
        "upload": upload,
        "job": job_result,
        "filename": gcode_path.name,
    }


def _send_moonraker(
    gcode_path: Path,
    *,
    base_url: str,
    api_key: str,
    start_print: bool,
    printer_id: str | None,
    timeout_sec: float,
) -> dict[str, Any]:
    """
    Moonraker (Klipper / Mainsail / Fluidd / 多くの Creality):
      POST /server/files/upload
    print=true でアップロード直後に印刷開始。
    """
    upload_url = f"{base_url}/server/files/upload"
    file_bytes = gcode_path.read_bytes()
    fields = {
        "root": "gcodes",
        "print": "true" if start_print else "false",
    }
    if printer_id:
        fields["path"] = printer_id.strip("/\\")

    body, content_type = _encode_multipart(
        fields,
        {
            "file": (
                gcode_path.name,
                file_bytes,
                "application/octet-stream",
            )
        },
    )
    headers: dict[str, str] = {"Content-Type": content_type}
    if api_key:
        # Moonraker は API Key 認証を有効化している場合がある
        headers["X-Api-Key"] = api_key
        headers["Authorization"] = f"Bearer {api_key}"

    print(
        f"[Printer/Moonraker] POST {upload_url} "
        f"({len(file_bytes)} bytes, start_print={start_print})"
    )
    upload = _http_json(
        "POST",
        upload_url,
        headers=headers,
        data=body,
        timeout_sec=timeout_sec,
    )
    if not upload.get("ok"):
        return {
            "ok": False,
            "backend": "moonraker",
            "api_url": upload_url,
            "step": "upload",
            **{k: v for k, v in upload.items() if k != "ok"},
        }

    job_result: dict[str, Any] | None = None
    if start_print and _env_truthy("PRINTER_FORCE_JOB_START", "false"):
        # 明示 start: POST /printer/print/start?filename=...
        fname = gcode_path.name
        if printer_id:
            fname = f"{printer_id.strip('/\\')}/{gcode_path.name}"
        start_url = (
            f"{base_url}/printer/print/start?"
            f"{parse.urlencode({'filename': fname})}"
        )
        print(f"[Printer/Moonraker] POST {start_url}")
        job_result = _http_json(
            "POST",
            start_url,
            headers={k: v for k, v in headers.items() if k != "Content-Type"},
            timeout_sec=timeout_sec,
        )
        if not job_result.get("ok"):
            return {
                "ok": False,
                "backend": "moonraker",
                "api_url": start_url,
                "step": "start",
                "upload": upload,
                **{k: v for k, v in job_result.items() if k != "ok"},
            }

    return {
        "ok": True,
        "backend": "moonraker",
        "api_url": upload_url,
        "uploaded": True,
        "print_started": start_print,
        "upload": upload,
        "job": job_result,
        "filename": gcode_path.name,
    }


def send_to_printer(
    gcode_path: Path,
    *,
    api_url: str | None = None,
    api_key: str | None = None,
    backend: str | None = None,
    printer_id: str | None = None,
    start_print: bool | None = None,
    timeout_sec: float = 180.0,
) -> dict[str, Any]:
    """
    G-code を 3Dプリンター（OctoPrint / Moonraker）へ送信する。

    環境変数:
      PRINTER_API_URL      例) http://192.168.1.50:5000
      PRINTER_API_KEY      OctoPrint / Moonraker API Key
      PRINTER_BACKEND      octoprint | moonraker | auto
      PRINTER_AUTO_START   送信成功後に印刷開始 (既定: true)
      PRINTER_DRY_RUN      true なら HTTP を飛ばさず検証のみ
      PRINTER_VERIFY_SSL   https 証明書検証 (既定: true)

    Args:
        gcode_path: 送信する .gcode
        api_url: プリンター API ベース URL。未指定時は PRINTER_API_URL
        api_key: API キー。未指定時は PRINTER_API_KEY 等
        backend: バックエンド種別
        printer_id: サブフォルダ等の識別子（複数台・整理用）
        start_print: True ならアップロード後に印刷開始。
                     None なら PRINTER_AUTO_START（既定 true）

    Returns:
        送信結果 dict（ok / backend / uploaded / print_started など）
    """
    load_env_files()
    gcode_path = Path(gcode_path)
    if not gcode_path.is_file():
        raise FileNotFoundError(f"G-code がありません: {gcode_path}")

    api_url = _normalize_printer_base_url(
        api_url or os.environ.get("PRINTER_API_URL", "")
    )
    api_key = (api_key if api_key is not None else resolve_printer_api_key()).strip()
    if start_print is None:
        start_print = _env_truthy("PRINTER_AUTO_START", "true")

    info = {
        "gcode": str(gcode_path),
        "size_bytes": gcode_path.stat().st_size,
        "printer_id": printer_id or os.environ.get("PRINTER_ID", "").strip() or None,
        "start_print": start_print,
        "queued_at": datetime.now(timezone.utc).isoformat(),
    }
    printer_id = info["printer_id"]

    if not api_url:
        print("[Printer] PRINTER_API_URL 未設定 - 送信をスキップ (stub)")
        return {
            "ok": False,
            "skipped": True,
            "reason": "api_url_not_configured",
            "info": info,
        }

    try:
        resolved_backend = resolve_printer_backend(api_url, backend)
    except ValueError as exc:
        return {
            "ok": False,
            "error": "invalid_backend",
            "detail": str(exc),
            "info": info,
            "api_url": api_url,
        }

    # OctoPrint は API Key 必須。Moonraker は設定による。
    if resolved_backend == "octoprint" and not api_key:
        print("[Printer] PRINTER_API_KEY / OCTOPRINT_API_KEY 未設定", file=sys.stderr)
        return {
            "ok": False,
            "skipped": True,
            "reason": "api_key_not_configured",
            "backend": resolved_backend,
            "api_url": api_url,
            "info": info,
        }

    if _env_truthy("PRINTER_DRY_RUN", "false"):
        print(
            f"[Printer] DRY_RUN: backend={resolved_backend} url={api_url} "
            f"file={gcode_path.name} start_print={start_print}"
        )
        return {
            "ok": True,
            "dry_run": True,
            "backend": resolved_backend,
            "api_url": api_url,
            "uploaded": False,
            "print_started": False,
            "would_start_print": start_print,
            "info": info,
        }

    print(
        f"[Printer] 送信開始: backend={resolved_backend} url={api_url} "
        f"file={gcode_path.name} ({info['size_bytes']} bytes)"
    )

    if resolved_backend == "octoprint":
        result = _send_octoprint(
            gcode_path,
            base_url=api_url,
            api_key=api_key,
            start_print=start_print,
            printer_id=printer_id,
            timeout_sec=timeout_sec,
        )
    else:
        result = _send_moonraker(
            gcode_path,
            base_url=api_url,
            api_key=api_key,
            start_print=start_print,
            printer_id=printer_id,
            timeout_sec=timeout_sec,
        )

    result["info"] = info
    if result.get("ok"):
        print(
            f"[Printer] 成功: uploaded=True print_started={result.get('print_started')}"
        )
    else:
        print(
            f"[Printer] 失敗: {result.get('error') or result.get('detail')}",
            file=sys.stderr,
        )
    return result


# ---------------------------------------------------------------------------
# バケツリレー本体
# ---------------------------------------------------------------------------
def generate_print_data(
    scad_path: Path,
    *,
    output_stem: Path | None = None,
    openscad: Path | None = None,
    curaengine: Path | None = None,
    definition: Path | None = None,
    extruder: Path | None = None,
    skip_upload: bool = False,
    skip_print: bool = False,
    start_print: bool | None = None,
    printer_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    extra_settings: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    .scad -> .stl -> .gcode を一連で生成し、必要なら外部 API へ渡す。

    Returns:
        生成パスと各ステップ結果を含む dict
    """
    load_env_files()
    scad_path = scad_path.resolve()
    if output_stem is None:
        out_dir = DEFAULT_OUTPUT_DIR
        stem = scad_path.stem
        output_stem = out_dir / stem
    else:
        output_stem = output_stem.resolve()

    stl_path = output_stem.with_suffix(".stl")
    gcode_path = output_stem.with_suffix(".gcode")

    openscad = openscad or _env_path("OPENSCAD_PATH", DEFAULT_OPENSCAD)
    curaengine = curaengine or _env_path("CURAENGINE_PATH", DEFAULT_CURAENGINE)
    definition = definition or _env_path("CURA_DEFINITION", DEFAULT_CURA_DEFINITION)
    extruder = extruder or _env_path("CURA_EXTRUDER", DEFAULT_CURA_EXTRUDER)

    print("=" * 60)
    print("AIものづくり自動化 - 印刷データ生成")
    print(f"  input : {scad_path}")
    print(f"  stl   : {stl_path}")
    print(f"  gcode : {gcode_path}")
    print("=" * 60)

    scad_to_stl(scad_path, stl_path, openscad=openscad)

    settings = dict(DEFAULT_SLICE_SETTINGS)
    if extra_settings:
        settings.update(extra_settings)

    stl_to_gcode(
        stl_path,
        gcode_path,
        curaengine=curaengine,
        definition=definition,
        extruder=extruder,
        extra_settings=extra_settings,
    )

    slice_summary = parse_gcode_slice_summary(gcode_path, settings=settings)
    slice_json_path = output_stem.with_suffix(".slice.json")
    write_slice_json(slice_json_path, slice_summary)

    files = {
        "scad": scad_path,
        "stl": stl_path,
        "gcode": gcode_path,
        "slice_json": slice_json_path,
    }
    upload_result: dict[str, Any] | None = None
    print_result: dict[str, Any] | None = None

    if not skip_upload:
        upload_meta = {
            **(metadata or {}),
            "slice": slice_summary,
        }
        upload_result = upload_to_tisly(
            files,
            metadata=upload_meta,
            slice_summary=slice_summary,
            name=stl_path.stem,
        )
    else:
        print("[TiSLY] --skip-upload 指定のためスキップ")

    if not skip_print:
        print_result = send_to_printer(
            gcode_path,
            printer_id=printer_id,
            start_print=start_print,
        )
    else:
        print("[Printer] --skip-print 指定のためスキップ")

    result = {
        "ok": True,
        "files": {k: str(v) for k, v in files.items()},
        "slice": slice_summary,
        "upload": upload_result,
        "print": print_result,
    }
    print("=" * 60)
    print("完了:", json.dumps(result, ensure_ascii=False, indent=2))
    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="OpenSCAD -> CuraEngine バケツリレーで .scad から .gcode を生成する",
    )
    p.add_argument(
        "scad",
        type=Path,
        help="入力 .scad ファイルパス",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="出力のベースパス (拡張子なし)。省略時は automation/output/<stem>",
    )
    p.add_argument(
        "--openscad",
        type=Path,
        default=None,
        help="openscad.exe のパス (省略時は OPENSCAD_PATH / 既定)",
    )
    p.add_argument(
        "--curaengine",
        type=Path,
        default=None,
        help="CuraEngine.exe のパス (省略時は CURAENGINE_PATH / 既定)",
    )
    p.add_argument(
        "--definition",
        type=Path,
        default=None,
        help="Cura プリンター定義 .def.json",
    )
    p.add_argument(
        "--extruder",
        type=Path,
        default=None,
        help="Cura エクストルーダー定義 .def.json",
    )
    p.add_argument(
        "--skip-upload",
        action="store_true",
        help="TiSLY へのアップロード枠を呼ばない",
    )
    p.add_argument(
        "--skip-print",
        action="store_true",
        help="プリンター送信を呼ばない",
    )
    p.add_argument(
        "--start-print",
        action="store_true",
        help="プリンターへ送ったあと印刷開始 (PRINTER_AUTO_START より優先)",
    )
    p.add_argument(
        "--no-start-print",
        action="store_true",
        help="アップロードのみ（印刷開始しない）",
    )
    p.add_argument(
        "--printer-id",
        default=None,
        help="プリンター識別子 / サブフォルダ (複数台運用用)",
    )
    p.add_argument(
        "--printer-backend",
        default=None,
        choices=["octoprint", "moonraker", "auto"],
        help="プリンター API 種別 (省略時は PRINTER_BACKEND / auto)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    # Windows cp932 コンソールでも Unicode ログが落ちないようにする
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    load_env_files()
    args = build_arg_parser().parse_args(argv)
    start_print: bool | None = None
    if args.no_start_print:
        start_print = False
    elif args.start_print:
        start_print = True

    try:
        # backend は環境変数経由でも渡せるよう、CLI 指定時は一時セット
        if args.printer_backend:
            os.environ["PRINTER_BACKEND"] = args.printer_backend

        generate_print_data(
            args.scad,
            output_stem=args.output,
            openscad=args.openscad,
            curaengine=args.curaengine,
            definition=args.definition,
            extruder=args.extruder,
            skip_upload=args.skip_upload,
            skip_print=args.skip_print,
            start_print=start_print,
            printer_id=args.printer_id,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
