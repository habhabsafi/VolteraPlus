(function () {
  const SLOT_LABELS = {
    "08:00": "8:00 a.m.",
    "10:00": "10:00 a.m.",
    "12:00": "12:00 p.m.",
    "14:00": "2:00 p.m.",
    "16:00": "4:00 p.m.",
  };
  const pad = (n) => String(n).padStart(2, "0");
  const shiftMonth = (month, offset) => {
    const [year, number] = month.split("-").map(Number);
    const date = new Date(Date.UTC(year, number - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
  };
  const labelMonth = (month) => {
    const [year, number] = month.split("-").map(Number);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "long" })
      .format(new Date(Date.UTC(year, number - 1, 1)));
  };

  document.querySelectorAll(".appointment-calendar").forEach((calendar) => {
    const dateInput = calendar.closest("form").querySelector(`[name="${calendar.dataset.dateName}"]`);
    const timeInput = calendar.closest("form").querySelector(`[name="${calendar.dataset.timeName}"]`);
    const title = calendar.querySelector("[data-calendar-title]");
    const dayGrid = calendar.querySelector("[data-calendar-days]");
    const timeList = calendar.querySelector("[data-calendar-times]");
    const message = calendar.querySelector("[data-calendar-message]");
    const previous = calendar.querySelector("[data-calendar-prev]");
    const next = calendar.querySelector("[data-calendar-next]");
    const firstMonth = calendar.dataset.month;
    const minMonth = calendar.dataset.minMonth || firstMonth;
    let month = firstMonth;
    let availability = {};

    function showTimes(date) {
      timeList.replaceChildren();
      const times = availability[date] || [];
      if (!times.length) {
        message.textContent = "No appointment times are available on this date.";
        return;
      }
      message.textContent = `Available start times for ${date}:`;
      times.forEach((time) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-time";
        button.textContent = SLOT_LABELS[time] || time;
        button.setAttribute("aria-pressed", String(timeInput.value === time));
        if (timeInput.value === time) button.classList.add("selected");
        button.addEventListener("click", () => {
          timeInput.value = time;
          timeList.querySelectorAll(".calendar-time").forEach((item) => {
            item.classList.toggle("selected", item === button);
            item.setAttribute("aria-pressed", String(item === button));
          });
        });
        timeList.append(button);
      });
    }

    function drawDays() {
      title.textContent = labelMonth(month);
      previous.disabled = month <= minMonth;
      dayGrid.replaceChildren();
      const [year, number] = month.split("-").map(Number);
      const start = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
      const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
      for (let i = 0; i < start; i++) {
        const blank = document.createElement("span");
        blank.className = "calendar-day blank";
        blank.setAttribute("aria-hidden", "true");
        dayGrid.append(blank);
      }
      for (let day = 1; day <= count; day++) {
        const date = `${month}-${pad(day)}`;
        const slots = availability[date] || [];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-day";
        button.textContent = String(day);
        button.disabled = !slots.length;
        button.setAttribute("aria-label", `${date}${slots.length ? ", available" : ", unavailable"}`);
        if (slots.length) button.classList.add("available");
        if (dateInput.value === date) button.classList.add("selected");
        button.addEventListener("click", () => {
          dateInput.value = date;
          timeInput.value = "";
          dayGrid.querySelectorAll(".calendar-day").forEach((item) => item.classList.toggle("selected", item === button));
          showTimes(date);
        });
        dayGrid.append(button);
      }
      if (dateInput.value && dateInput.value.startsWith(month)) showTimes(dateInput.value);
      else {
        timeList.replaceChildren();
        message.textContent = "Select an available date to see appointment times.";
      }
    }

    async function loadMonth(newMonth) {
      month = newMonth;
      availability = {};
      drawDays();
      message.textContent = "Loading available dates…";
      try {
        const response = await fetch(`${calendar.dataset.availability}?month=${encodeURIComponent(month)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to load available dates.");
        availability = result.days || {};
        drawDays();
        if (!Object.values(availability).some((slots) => slots.length)) {
          message.textContent = "No appointment times are available this month.";
        }
      } catch (error) {
        message.textContent = error.message || "Unable to load available dates. Please try again.";
      }
    }

    previous.addEventListener("click", () => {
      if (month > minMonth) loadMonth(shiftMonth(month, -1));
    });
    next.addEventListener("click", () => loadMonth(shiftMonth(month, 1)));
    calendar.closest("form").addEventListener("submit", (event) => {
      const available = availability[dateInput.value] || [];
      if (!dateInput.value || !available.includes(timeInput.value)) {
        event.preventDefault();
        message.textContent = "Choose an available date and start time before continuing.";
        message.classList.add("calendar-error");
      }
    });
    loadMonth(month);
  });
})();
