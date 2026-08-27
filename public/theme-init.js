try {
  var theme = localStorage.getItem("theme");
  var dark = theme === "dark";
  var root = document.documentElement;
  root.classList.toggle("dark", dark);
  // Pre-paint background to avoid a flash before the CSS bundle loads.
  // Applied via CSSOM so it is not blocked by the strict style-src CSP.
  root.style.background = dark ? "#101014" : "#f9fafb";
} catch (e) {}
