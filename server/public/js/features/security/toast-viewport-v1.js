/**
 * スクロールしてもビューポート下端に残るトースト。
 * 親の transform / filter に引きずられないようトップレイヤーへ出す。
 */

const hideTimers = new Map();

function pinToastElement(el) {
  el.style.setProperty("position", "fixed", "important");
  el.style.setProperty("inset", "auto", "important");
  el.style.setProperty("top", "auto", "important");
  el.style.setProperty("right", "auto", "important");
  el.style.setProperty("bottom", "24px", "important");
  el.style.setProperty("left", "50%", "important");
  el.style.setProperty("margin", "0", "important");
  el.style.setProperty("transform", "translateX(-50%)", "important");
  el.style.setProperty("z-index", "9999", "important");
}

export function showViewportToast(id, className, message, hideMs = 3200) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
  el.className = `${className} is-visible`;
  el.textContent = message;
  el.setAttribute("popover", "manual");
  pinToastElement(el);
  let opened = false;
  if (typeof el.showPopover === "function") {
    try {
      if (!el.matches(":popover-open")) el.showPopover();
      opened = el.matches(":popover-open");
    } catch {
      opened = false;
    }
  }
  if (!opened) {
    el.removeAttribute("popover");
    pinToastElement(el);
  }
  const prev = hideTimers.get(id);
  if (prev) clearTimeout(prev);
  hideTimers.set(
    id,
    setTimeout(() => {
      el.classList.remove("is-visible");
      if (typeof el.hidePopover === "function") {
        try {
          if (el.matches(":popover-open")) el.hidePopover();
        } catch {
          /* 非対応でもクラス除去で消える */
        }
      }
    }, hideMs)
  );
}
