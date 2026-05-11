document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);

  const btn = document.createElement("button");
  btn.className = "theme-toggle";
  btn.innerHTML = saved === "dark" ? '\u262F Dark' : '\u2600 Light';
  document.body.appendChild(btn);

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    btn.innerHTML = next === "dark" ? '\u262F Dark' : '\u2600 Light';
  });
});
