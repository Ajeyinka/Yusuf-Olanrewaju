(() => {
  function initWorkTimelines() {
    document.querySelectorAll(".work-timeline").forEach((timeline) => {
      if (timeline.dataset.initialized) return;
      timeline.dataset.initialized = "true";

      const steps = [...timeline.querySelectorAll(".work-step")];
      const rail = timeline.querySelector(".work-timeline__rail");
      const fill = timeline.querySelector(".work-timeline__fill");
      const markers = steps.map((step) =>
        step.querySelector(".work-step__marker"),
      );

      if (!steps.length || !rail || !fill) return;

      let framePending = false;

      function update() {
        framePending = false;

        const timelineRect = timeline.getBoundingClientRect();

        const markerCenters = markers.map((marker) => {
          const rect = marker.getBoundingClientRect();
          return rect.top + rect.height / 2;
        });

        const firstCenter = markerCenters[0];
        const lastCenter = markerCenters[markerCenters.length - 1];
        const lineHeight = Math.max(0, lastCenter - firstCenter);

        // Activation point: 55% down the viewport.
        const triggerY = window.innerHeight * 0.55;

        const progress =
          lineHeight > 0
            ? Math.max(0, Math.min(1, (triggerY - firstCenter) / lineHeight))
            : 0;

        rail.style.top = `${firstCenter - timelineRect.top}px`;
        rail.style.height = `${lineHeight}px`;
        fill.style.transform = `scaleY(${progress})`;

        steps.forEach((step, index) => {
          step.classList.toggle("is-active", markerCenters[index] <= triggerY);
        });
      }

      function requestUpdate() {
        if (framePending) return;
        framePending = true;
        requestAnimationFrame(update);
      }

      window.addEventListener("scroll", requestUpdate, { passive: true });
      window.addEventListener("resize", requestUpdate);
      window.addEventListener("load", requestUpdate);

      if ("ResizeObserver" in window) {
        new ResizeObserver(requestUpdate).observe(timeline);
      }

      if (document.fonts) {
        document.fonts.ready.then(requestUpdate);
      }

      update();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWorkTimelines);
  } else {
    initWorkTimelines();
  }
})();

(() => {
  function cleanText(text) {
    return text.replace(/&amp;/g, "&").replace(/&E;/g, "&E").trim();
  }

  function parseProjects(markdown) {
    const categories = [];
    let category = null;
    let project = null;
    let projectType = "";

    const lines = markdown
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .split("\n");

    for (const line of lines) {
      const heading = line.match(/^(#{2,5})\s+(.+?)\s*$/);

      if (heading) {
        const level = heading[1].length;
        const text = cleanText(heading[2]);

        if (level === 2) {
          category = {
            title: text,
            projects: [],
          };

          categories.push(category);
          project = null;
          projectType = "";
        }

        if (level === 3) {
          projectType = text;
          project = null;
        }

        if (level === 4) {
          if (!category) {
            throw new Error("Add a ## category heading before your projects.");
          }

          project = {
            type: projectType,
            title: text,
            organisation: [],
            lines: [],
            highlights: [],
          };

          category.projects.push(project);
        }

        if (level === 5 && project) {
          if (text.startsWith("•")) {
            project.highlights.push(
              ...text
                .split("•")
                .map((highlight) => highlight.trim())
                .filter(Boolean),
            );
          } else {
            project.organisation.push(text);
          }
        }

        continue;
      }

      if (project) {
        project.lines.push(line);
      }
    }

    const validCategories = categories.filter(
      (entry) => entry.projects.length > 0,
    );

    if (!validCategories.length) {
      throw new Error(
        "No projects found. Use ## for categories and #### for project titles.",
      );
    }

    return validCategories;
  }

  function renderDescription(lines) {
    const fragment = document.createDocumentFragment();
    let paragraph = [];
    let list = null;
    let listType = null;

    function flushParagraph() {
      if (!paragraph.length) return;

      const element = document.createElement("p");
      element.textContent = cleanText(paragraph.join(" "));
      fragment.append(element);
      paragraph = [];
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
        flushParagraph();
        list = null;
        listType = null;
        continue;
      }

      const bullet = line.match(/^[-*+]\s+(.+)$/);
      const numbered = line.match(/^\d+[.)]\s+(.+)$/);

      if (bullet || numbered) {
        flushParagraph();

        const type = bullet ? "ul" : "ol";

        if (!list || listType !== type) {
          list = document.createElement(type);
          listType = type;

          if (numbered) {
            list.start = Number(line.match(/^\d+/)[0]);
          }

          fragment.append(list);
        }

        const item = document.createElement("li");
        item.textContent = cleanText((bullet || numbered)[1]);
        list.append(item);
      } else {
        list = null;
        listType = null;
        paragraph.push(line);
      }
    }

    flushParagraph();
    return fragment;
  }

  function setupAccordion(item) {
    const summary = item.querySelector("summary");
    const answer = item.querySelector(".md-faq__answer");
    const inner = item.querySelector(".md-faq__answer-inner");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let animation = null;
    let expanded = item.open;

    summary.addEventListener("click", (event) => {
      event.preventDefault();

      const startHeight = item.open ? answer.getBoundingClientRect().height : 0;

      const startOpacity = item.open ? getComputedStyle(answer).opacity : "0";

      if (animation) {
        animation.cancel();
        animation = null;
      }

      expanded = !expanded;
      item.classList.toggle("is-expanded", expanded);

      if (reducedMotion.matches || !answer.animate) {
        item.open = expanded;
        return;
      }

      item.open = true;

      const endHeight = expanded ? inner.getBoundingClientRect().height : 0;

      const currentAnimation = answer.animate(
        [
          {
            height: `${startHeight}px`,
            opacity: startOpacity,
          },
          {
            height: `${endHeight}px`,
            opacity: expanded ? 1 : 0,
          },
        ],
        {
          duration: 280,
          easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
          fill: "both",
        },
      );

      animation = currentAnimation;

      currentAnimation.onfinish = () => {
        if (animation !== currentAnimation) return;

        item.open = expanded;
        currentAnimation.cancel();
        animation = null;
      };
    });
  }

  function createProject(project) {
    const item = document.createElement("details");
    item.className = "md-faq__item";

    const summary = document.createElement("summary");

    const heading = document.createElement("span");
    heading.className = "md-project__heading";

    if (project.type) {
      const type = document.createElement("span");
      type.className = "md-project__type";
      type.textContent = project.type;
      heading.append(type);
    }

    const title = document.createElement("span");
    title.className = "md-project__title";
    title.textContent = project.title;
    heading.append(title);

    const icon = document.createElement("span");
    icon.className = "md-faq__icon";
    icon.setAttribute("aria-hidden", "true");

    summary.append(heading, icon);

    const answer = document.createElement("div");
    answer.className = "md-faq__answer";

    const inner = document.createElement("div");
    inner.className = "md-faq__answer-inner";

    if (project.organisation.length) {
      const organisation = document.createElement("p");
      organisation.className = "md-project__organisation";
      organisation.textContent = project.organisation.join(" · ");
      inner.append(organisation);
    }

    inner.append(renderDescription(project.lines));

    if (project.highlights.length) {
      const highlights = document.createElement("ul");
      highlights.className = "md-project__highlights";

      project.highlights.forEach((text) => {
        const highlight = document.createElement("li");
        highlight.textContent = text;
        highlights.append(highlight);
      });

      inner.append(highlights);
    }

    answer.append(inner);
    item.append(summary, answer);

    setupAccordion(item);
    return item;
  }

  async function initProjects(section, sectionIndex) {
    if (section.dataset.initialized) return;
    section.dataset.initialized = "true";

    const content = section.querySelector(".md-faq__content");
    const status = section.querySelector(".md-faq__status");
    const tabList = section.querySelector(".md-faq__tabs");
    const panelContainer = section.querySelector(".md-faq__panels");
    const url = section.dataset.markdownUrl;

    if (!content || !status || !tabList || !panelContainer) {
      console.error("Project section is missing required HTML elements.");
      return;
    }

    content.setAttribute("aria-busy", "true");
    status.textContent = "Loading projects…";

    try {
      if (!url) {
        throw new Error("Missing Markdown URL.");
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Project request failed: ${response.status}`);
      }

      const categories = parseProjects(await response.text());
      const tabs = [];
      const panels = [];
      const prefix = `md-projects-${sectionIndex}`;

      tabList.replaceChildren();
      panelContainer.replaceChildren();
      tabList.setAttribute("aria-label", "Project categories");

      function activateTab(index, moveFocus = false) {
        tabs.forEach((tab, tabIndex) => {
          const selected = tabIndex === index;

          tab.setAttribute("aria-selected", String(selected));
          tab.tabIndex = selected ? 0 : -1;
          panels[tabIndex].hidden = !selected;
        });

        if (moveFocus) tabs[index].focus();
      }

      categories.forEach((category, index) => {
        const tabId = `${prefix}-tab-${index}`;
        const panelId = `${prefix}-panel-${index}`;

        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "md-faq__tab";
        tab.id = tabId;
        tab.textContent = category.title;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", panelId);

        const panel = document.createElement("div");
        panel.className = "md-faq__panel";
        panel.id = panelId;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tabId);
        panel.tabIndex = 0;

        category.projects.forEach((project) => {
          panel.append(createProject(project));
        });

        tab.addEventListener("click", () => activateTab(index));

        tab.addEventListener("keydown", (event) => {
          let nextIndex;

          switch (event.key) {
            case "ArrowRight":
              nextIndex = (index + 1) % tabs.length;
              break;
            case "ArrowLeft":
              nextIndex = (index - 1 + tabs.length) % tabs.length;
              break;
            case "Home":
              nextIndex = 0;
              break;
            case "End":
              nextIndex = tabs.length - 1;
              break;
            default:
              return;
          }

          event.preventDefault();
          activateTab(nextIndex, true);
        });

        tabs.push(tab);
        panels.push(panel);
        tabList.append(tab);
        panelContainer.append(panel);
      });

      activateTab(0);
      tabList.hidden = false;
      status.hidden = true;
    } catch (error) {
      tabList.hidden = true;
      tabList.replaceChildren();
      panelContainer.replaceChildren();
      status.hidden = false;
      status.textContent =
        "Projects could not be loaded. Please try again later.";

      console.error("Project loading error:", error);
    } finally {
      content.setAttribute("aria-busy", "false");
    }
  }

  function start() {
    document.querySelectorAll(".md-faq").forEach((section, index) => {
      initProjects(section, index);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

const navbar = document.querySelector(".navbar");

const toggleButton = document.getElementById("toggle_button");
const navbarLinks = document.querySelector(".nav-list");
const menuBars = document.querySelectorAll(".bar");

const servicesDropdown = document.querySelector(".nav-dropdown");
const servicesToggle = document.getElementById("services-toggle");

// Navbar scroll effect
window.addEventListener("scroll", () => {
  if (navbar) {
    navbar.classList.toggle("scrolled", window.scrollY > 50);
  }
});

// Close Services dropdown
function closeServicesDropdown() {
  if (!servicesDropdown || !servicesToggle) return;

  servicesDropdown.classList.remove("open");
  servicesToggle.setAttribute("aria-expanded", "false");
}

// Mobile hamburger menu
if (toggleButton && navbarLinks) {
  toggleButton.addEventListener("click", () => {
    const isOpen = navbarLinks.classList.toggle("active");

    toggleButton.classList.toggle("active", isOpen);
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    toggleButton.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu",
    );

    menuBars.forEach((bar) => {
      bar.classList.toggle("active", isOpen);
    });

    if (!isOpen) {
      closeServicesDropdown();
    }
  });

  // Close mobile menu when a navigation link is clicked
  navbarLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navbarLinks.classList.remove("active");
      toggleButton.classList.remove("active");
      toggleButton.setAttribute("aria-expanded", "false");
      toggleButton.setAttribute("aria-label", "Open navigation menu");

      menuBars.forEach((bar) => {
        bar.classList.remove("active");
      });

      closeServicesDropdown();
    });
  });
}

// Services dropdown
if (servicesDropdown && servicesToggle) {
  servicesToggle.addEventListener("click", (event) => {
    event.stopPropagation();

    const isOpen = servicesDropdown.classList.toggle("open");

    servicesToggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (event) => {
    if (!servicesDropdown.contains(event.target)) {
      closeServicesDropdown();
    }
  });

  // Close dropdown and mobile menu with Escape
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeServicesDropdown();

      if (navbarLinks && toggleButton) {
        navbarLinks.classList.remove("active");
        toggleButton.classList.remove("active");
        toggleButton.setAttribute("aria-expanded", "false");
        toggleButton.setAttribute("aria-label", "Open navigation menu");

        menuBars.forEach((bar) => {
          bar.classList.remove("active");
        });
      }
    }
  });
}
