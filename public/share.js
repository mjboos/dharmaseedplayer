// Shareable pages live in the URL hash (e.g. #talk/123, #retreat/45), so they need no server routes.

/** The full URL of an in-app page, e.g. linkTo("talk/123"). */
export function linkTo(route) {
  return `${window.location.origin}${window.location.pathname}#${route}`;
}

/** Copies `url` to the clipboard and briefly shows "Copied!" on the button. */
export async function copyLink(url, button) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    prompt("Copy this link:", url);
    return;
  }
  const label = button.dataset.label || button.textContent;
  button.dataset.label = label;
  button.textContent = "Copied!";
  setTimeout(() => { button.textContent = label; }, 2000);
}
