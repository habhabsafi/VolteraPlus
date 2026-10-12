document.addEventListener("submit", function (e) {
  var msg = e.target.getAttribute("data-confirm");
  if (msg && !window.confirm(msg)) e.preventDefault();
});

// "Add item" buttons clone the last row and bump its numeric suffix.
document.addEventListener("click", function (e) {
  var btn = e.target.closest("[data-add-row]");
  if (!btn) return;
  var box = btn.previousElementSibling;
  var last = box.lastElementChild;
  var clone = last.cloneNode(true);
  var next = box.children.length;
  clone.querySelectorAll("input, textarea").forEach(function (el) {
    el.name = el.name.replace(/_\d+$/, "_" + next);
    el.value = "";
  });
  box.appendChild(clone);
});
