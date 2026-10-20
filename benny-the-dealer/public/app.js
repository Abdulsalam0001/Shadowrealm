const menuToggle = document.querySelector("#menuToggle");
const siteNav = document.querySelector("#siteNav");
const form = document.querySelector("#inquiryForm");
const formMessage = document.querySelector("#formMessage");
const submitButton = form?.querySelector('button[type="submit"]');

document.querySelector("#year").textContent = new Date().getFullYear();

menuToggle?.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Toggle navigation");
});

siteNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    siteNav.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});

document.querySelectorAll("[data-service]").forEach((link) => {
  link.addEventListener("click", () => {
    const select = form?.querySelector('[name="service"]');
    if (select) select.value = link.dataset.service;
  });
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  if (!data.get("consent")) {
    formMessage.textContent = "Please confirm that we may use your details to reply.";
    formMessage.className = "form-message error";
    return;
  }

  payload.consent = true;
  formMessage.textContent = "Sending your brief…";
  formMessage.className = "form-message";
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "We couldn't send that just now.");

    formMessage.textContent = result.reference
      ? `Received. Keep this reference: ${result.reference}. We'll follow up after review.`
      : (result.message || "Thanks — your request has been received.");
    formMessage.className = "form-message";
    form.reset();
  } catch (error) {
    formMessage.textContent = error.message || "Something went wrong. Please try again.";
    formMessage.className = "form-message error";
  } finally {
    submitButton.disabled = false;
  }
});