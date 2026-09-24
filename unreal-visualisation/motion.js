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
  var carousels = Array.from(document.querySelectorAll("[data-carousel]")).map(function (stage) {
    return {
      stage: stage,
      slides: Array.from(stage.querySelectorAll(".carousel-slide")),
      dots: Array.from(stage.parentElement.querySelectorAll(".carousel-dot")),
      visible: false,
      index: 0,
      timer: null
    };
  });

  function showSlide(carousel, index) {
    carousel.index = index;
    carousel.slides.forEach(function (slide, i) {
      slide.classList.toggle("is-active", i === index);
      slide.setAttribute("aria-hidden", String(i !== index));
      carousel.dots[i].setAttribute("aria-pressed", String(i === index));
    });
  }

  function syncCarousel(carousel) {
    window.clearTimeout(carousel.timer);
    if (!paused && !document.hidden && carousel.visible) {
      carousel.timer = window.setTimeout(function () {
        showSlide(carousel, (carousel.index + 1) % carousel.slides.length);
        syncCarousel(carousel);
      }, 5000);
    }
  }

  carousels.forEach(function (carousel) {
    carousel.dots.forEach(function (dot, index) {
      dot.addEventListener("click", function () {
        showSlide(carousel, index);
        syncCarousel(carousel);
      });
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
    carousels.forEach(syncCarousel);
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
          var carousel = carousels.find(function (item) { return item.stage === entry.target; });
          if (carousel) carousel.visible = active;
        }
      });
      sync();
    }, { threshold: [0, 0.15] });
    videos.forEach(function (video) { observer.observe(video); });
    carousels.forEach(function (carousel) { observer.observe(carousel.stage); });
  }
  // Without an observer or JavaScript the static posters remain a complete presentation.
  sync();
})();
