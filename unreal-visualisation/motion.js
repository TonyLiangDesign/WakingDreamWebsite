(function () {
  var nav = document.getElementById("nav");
  function onScroll() { nav.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var videos = Array.from(document.querySelectorAll(".work-video"));
  var toggle = document.querySelector(".motion-toggle");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var paused = reducedMotion.matches;
  var visible = new Set();
  var carSlides = Array.from(document.querySelectorAll(".automotive-slide"));
  var carDots = Array.from(document.querySelectorAll(".carousel-dot"));
  var carVisible = false;
  var carIndex = 0;
  var carTimer;

  function showCar(index) {
    carIndex = index;
    carSlides.forEach(function (slide, i) {
      slide.classList.toggle("is-active", i === index);
      slide.setAttribute("aria-hidden", String(i !== index));
      carDots[i].setAttribute("aria-pressed", String(i === index));
    });
  }

  function syncCarousel() {
    window.clearTimeout(carTimer);
    if (!paused && !document.hidden && carVisible) {
      carTimer = window.setTimeout(function () {
        showCar((carIndex + 1) % carSlides.length);
        syncCarousel();
      }, 5000);
    }
  }

  carDots.forEach(function (dot, index) {
    dot.addEventListener("click", function () {
      showCar(index);
      syncCarousel();
    });
  });

  function load(video) {
    if (video.dataset.loaded) return;
    video.muted = true;
    video.querySelectorAll("source[data-src]").forEach(function (source) {
      source.src = source.dataset.src;
    });
    video.dataset.loaded = "true";
    video.load();
  }

  function sync() {
    document.body.classList.toggle("motion-paused", paused || document.hidden);
    document.body.classList.toggle("motion-enabled", !paused);
    toggle.textContent = paused ? "Play motion" : "Pause motion";
    toggle.setAttribute("aria-pressed", String(paused));
    syncCarousel();
    videos.forEach(function (video) {
      if (paused || document.hidden || !visible.has(video)) {
        video.pause();
        return;
      }
      load(video);
      // If autoplay is restricted, keep the poster rather than exposing player chrome.
      var playback = video.play();
      if (playback) playback.catch(function () {});
    });
  }

  toggle.addEventListener("click", function () { paused = !paused; sync(); });
  reducedMotion.addEventListener("change", function (event) { paused = event.matches; sync(); });
  document.addEventListener("visibilitychange", sync);

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var active = entry.isIntersecting && entry.intersectionRatio >= 0.15;
        entry.target.classList.toggle("is-visible", active);
        if (entry.target.tagName === "VIDEO") {
          if (active) visible.add(entry.target);
          else visible.delete(entry.target);
        } else {
          carVisible = active;
        }
      });
      sync();
    }, { threshold: [0, 0.15] });
    videos.forEach(function (video) { observer.observe(video); });
    observer.observe(document.querySelector(".automotive-stage"));
  }
  // Without an observer or JavaScript the static posters remain a complete presentation.
  sync();
})();
