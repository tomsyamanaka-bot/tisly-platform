#!/usr/bin/env python3
"""
AIものづくり自動化 - 印刷データ生成バケツリレー（ベース）

パイプライン:
  1. OpenSCAD  : .scad  -> .stl
  2. CuraEngine: .stl   -> .gcode
  3. (将来)    : TiSLY ナレッジ API / 3Dプリンター Web API へ送信

使い方:
  python generate_print_data.py samples/cube.scad
  python generate_print_data.py path/to/model.scad --skip-upload --skip-print
  python generate_print_data.py path/to/model.scad -o output/custom_name

環境変数（任意・未設定時は下記 DEFAULT_* を使用）:
  OPENSCAD_PATH, CURAENGINE_PATH, CURA_DEFINITION, CURA_EXTRUDER
  CURA_ENGINE_SEARCH_PATH, TISLY_PRINT_API_URL / TISLY_KNOWLEDGE_API_URL,
  TISLY_PRINT_UPLOAD_TOKEN, PRINTER_API_URL
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

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


# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------
def _env_path(name: str, default: Path) -> Path:
    raw = os.environ.get(name, "").strip()
    return Path(raw) if raw else default


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
# Step 3b: 3Dプリンター Web API へ送信（枠組み）
# ---------------------------------------------------------------------------
def send_to_printer(
    gcode_path: Path,
    *,
    api_url: str | None = None,
    printer_id: str | None = None,
    start_print: bool = False,
) -> dict[str, Any]:
    """
    G-code を 3Dプリンター（または中継ゲートウェイ）へ送る枠組み。

    TODO（後続実装）:
      - OctoPrint / Moonraker / メーカー固有 Web API への対応
      - 認証・ジョブ名指定・ベッド温度プリヒート
      - start_print=True のとき印刷開始、False ならアップロードのみ
      - ジョブ状態ポーリング

    Args:
        gcode_path: 送信する .gcode
        api_url: プリンター API。未指定時は環境変数 PRINTER_API_URL
        printer_id: 複数台運用時の識別子
        start_print: True ならアップロード後に印刷開始

    Returns:
        API レスポンス相当の dict（未実装時は stub 結果）
    """
    if not gcode_path.is_file():
        raise FileNotFoundError(f"G-code がありません: {gcode_path}")

    api_url = (api_url or os.environ.get("PRINTER_API_URL", "")).strip()
    info = {
        "gcode": str(gcode_path),
        "size_bytes": gcode_path.stat().st_size,
        "printer_id": printer_id,
        "start_print": start_print,
        "queued_at": datetime.now(timezone.utc).isoformat(),
    }

    if not api_url:
        print("[Printer] PRINTER_API_URL 未設定 - 送信をスキップ (stub)")
        return {
            "ok": False,
            "skipped": True,
            "reason": "api_url_not_configured",
            "info": info,
        }

    print(f"[Printer] 送信準備（未実装）: {api_url}")
    print(f"[Printer] info: {json.dumps(info, ensure_ascii=False)}")

    # --- 実装プレースホルダ ---
    # 将来: gcode を POST /api/files/local 等へアップロードし、
    #       start_print なら /api/job で印刷開始。
    _ = (request, error)  # 将来の HTTP 実装用に import を保持

    return {
        "ok": False,
        "skipped": True,
        "reason": "not_implemented",
        "api_url": api_url,
        "info": info,
    }


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
    start_print: bool = False,
    printer_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    extra_settings: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    .scad -> .stl -> .gcode を一連で生成し、必要なら外部 API へ渡す。

    Returns:
        生成パスと各ステップ結果を含む dict
    """
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
        help="プリンター送信枠を呼ばない",
    )
    p.add_argument(
        "--start-print",
        action="store_true",
        help="プリンターへ送ったあと印刷開始 (実装後に有効)",
    )
    p.add_argument(
        "--printer-id",
        default=None,
        help="プリンター識別子 (複数台運用用)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    # Windows cp932 コンソールでも Unicode ログが落ちないようにする
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    args = build_arg_parser().parse_args(argv)
    try:
        generate_print_data(
            args.scad,
            output_stem=args.output,
            openscad=args.openscad,
            curaengine=args.curaengine,
            definition=args.definition,
            extruder=args.extruder,
            skip_upload=args.skip_upload,
            skip_print=args.skip_print,
            start_print=args.start_print,
            printer_id=args.printer_id,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
