(function () {
  const buttons = [...document.querySelectorAll("[data-language]")];
  const status = document.querySelector("#translationStatus");
  const languageCookie = document.cookie.split("; ").find((cookie) => cookie.startsWith("googtrans="));
  let currentLanguage = languageCookie && decodeURIComponent(languageCookie.split("=")[1]) === "/en/fr" ? "fr" : "en";
  let translateInitialized = false;
  let translateLoading = false;

  function updateLanguageButtons(language) {
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.language === language));
    });
    document.documentElement.lang = language;
  }

  function showTranslationError() {
    currentLanguage = "en";
    translateLoading = false;
    document.cookie = "googtrans=; path=/; max-age=0; SameSite=Lax";
    updateLanguageButtons("en");
    if (status) status.textContent = "French translation could not be loaded. Please try again later.";
  }

  function translateWhenReady(attempts = 40) {
    const select = document.querySelector(".goog-te-combo");
    if (select) {
      select.value = "fr";
      select.dispatchEvent(new Event("change"));
      translateLoading = false;
      if (status) status.textContent = "";
      return;
    }
    if (attempts > 0) {
      window.setTimeout(() => translateWhenReady(attempts - 1), 250);
    } else {
      showTranslationError();
    }
  }

  function initializeGoogleTranslate() {
    new window.google.translate.TranslateElement({
      pageLanguage: "en",
      includedLanguages: "fr",
      autoDisplay: false,
    }, "google_translate_element");
    translateInitialized = true;
    translateWhenReady();
  }

  function selectFrench() {
    currentLanguage = "fr";
    document.cookie = "googtrans=/en/fr; path=/; max-age=31536000; SameSite=Lax";
    updateLanguageButtons("fr");
    if (translateInitialized) {
      translateWhenReady();
      return;
    }
    if (translateLoading) return;

    translateLoading = true;
    const script = document.createElement("script");
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.onerror = showTranslationError;
    document.head.appendChild(script);
  }

  function selectEnglish() {
    currentLanguage = "en";
    document.cookie = "googtrans=/en/en; path=/; max-age=31536000; SameSite=Lax";
    updateLanguageButtons("en");
    window.location.reload();
  }

  window.googleTranslateElementInit = initializeGoogleTranslate;
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.language === "fr" && currentLanguage !== "fr") {
        selectFrench();
      } else if (button.dataset.language === "en" && currentLanguage !== "en") {
        selectEnglish();
      }
    });
  });
  updateLanguageButtons(currentLanguage);

  if (currentLanguage === "fr") selectFrench();
})();
