export function setupTooltips(tooltip) {
  let hovered;
  let focused;
  let active;
  const attributes = new MutationObserver(update);

  function triggerFor(node) {
    return node instanceof Element ? node.closest("[data-tooltip]") : null;
  }

  function update() {
    const trigger = hovered ?? focused;
    if (active !== trigger) {
      attributes.disconnect();
      active = trigger;
      if (active) attributes.observe(active, { attributeFilter: ["data-tooltip", "hidden"] });
    }
    const label = active?.isConnected && !active.hidden &&
      !active.matches("details[open] > summary") && active.dataset.tooltip;
    if (!label) {
      tooltip.hidePopover();
      return;
    }
    const parent = active.closest("dialog[open]") ?? document.body;
    const rect = active.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    const dialogRect = parent === document.body ? null : parent.getBoundingClientRect();
    if (!rect.width || !rect.height ||
        rect.right <= Math.max(0, dialogRect?.left ?? 0) ||
        rect.left >= Math.min(clientWidth, dialogRect?.right ?? clientWidth) ||
        rect.bottom <= Math.max(0, dialogRect?.top ?? 0) ||
        rect.top >= Math.min(clientHeight, dialogRect?.bottom ?? clientHeight)) {
      tooltip.hidePopover();
      return;
    }
    if (tooltip.parentElement !== parent) {
      tooltip.hidePopover();
      parent.append(tooltip);
    }
    if (tooltip.textContent !== label) tooltip.textContent = label;
    if (!tooltip.matches(":popover-open")) tooltip.showPopover();
    const { offsetWidth, offsetHeight } = tooltip;
    const below = rect.top < offsetHeight + 14;
    tooltip.toggleAttribute("data-below", below);
    tooltip.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - offsetWidth) / 2, clientWidth - offsetWidth - 8))}px`;
    tooltip.style.top = `${below ? rect.bottom + 6 : rect.top - offsetHeight - 6}px`;
  }

  function dismiss() {
    if (!active) return;
    hovered = focused = null;
    update();
  }

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch" || tooltip.contains(event.target)) return;
    const trigger = triggerFor(event.target);
    if (trigger === hovered) return;
    hovered = trigger;
    update();
  });
  document.addEventListener("pointerout", (event) => {
    if (!hovered || triggerFor(event.relatedTarget) === hovered || tooltip.contains(event.relatedTarget)) return;
    if (triggerFor(event.target) !== hovered && !tooltip.contains(event.target)) return;
    hovered = null;
    update();
  });
  document.addEventListener("focusin", (event) => {
    focused = null;
    if (event.target.matches(":focus-visible")) {
      hovered = null;
      focused = triggerFor(event.target);
    }
    update();
  });
  document.addEventListener("focusout", () => {
    focused = null;
    update();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !tooltip.matches(":popover-open")) return;
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  }, true);
  document.addEventListener("pointerdown", dismiss, true);
  document.addEventListener("click", (event) => {
    if (event.detail === 0) dismiss();
  }, true);
  document.addEventListener("close", (event) => {
    if (event.target === tooltip.parentElement) dismiss();
  }, true);
  document.addEventListener("scroll", () => {
    if (!active) return;
    hovered = null;
    update();
  }, true);
  window.addEventListener("resize", dismiss);
}
