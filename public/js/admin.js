document.addEventListener("submit", function (e) {
  var msg = e.target.getAttribute("data-confirm");
  if (msg && !window.confirm(msg)) e.preventDefault();
});

var adminMenuToggle = document.querySelector(".admin-menu-toggle");
var adminMenu = document.querySelector("#admin-menu");
if (adminMenuToggle && adminMenu) {
  function closeAdminMenu() {
    adminMenu.classList.remove("is-open");
    adminMenuToggle.setAttribute("aria-expanded", "false");
  }

  adminMenuToggle.addEventListener("click", function () {
    var isOpen = adminMenuToggle.getAttribute("aria-expanded") === "true";
    adminMenu.classList.toggle("is-open", !isOpen);
    adminMenuToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", function (e) {
    if (!adminMenu.contains(e.target) && !adminMenuToggle.contains(e.target)) closeAdminMenu();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && adminMenu.classList.contains("is-open")) {
      closeAdminMenu();
      adminMenuToggle.focus();
    }
  });
}

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

document.addEventListener("mousedown", function (e) {
  if (e.target.closest("[data-rich-command]")) e.preventDefault();
});

document.addEventListener("click", function (e) {
  var button = e.target.closest("[data-rich-command]");
  if (!button) return;
  var editor = button.closest(".rich-field").querySelector("[data-rich-editor]");
  var command = button.dataset.richCommand;
  editor.focus();
  if (command === "createLink") {
    var url = window.prompt("Enter a link URL");
    if (url) document.execCommand(command, false, url);
  } else {
    document.execCommand(command, false, button.dataset.richValue || null);
  }
});

document.querySelectorAll("[data-rich-form]").forEach(function (form) {
  form.addEventListener("submit", function () {
    form.querySelectorAll(".rich-field").forEach(function (field) {
      field.querySelector("[data-rich-value]").value = field.querySelector("[data-rich-editor]").innerHTML;
    });
  });
});
