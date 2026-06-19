(function () {
  const container = document.getElementById('swipeContainer');
  const hint = document.getElementById('swipeHint');
  const sections = container.querySelectorAll('.game-section');
  const totalPages = sections.length;
  let currentPage = 0;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let isSwiping = false;

  const SWIPE_THRESHOLD = 30;
  const ANGLE_THRESHOLD = 30;

  function goToPage(index) {
    currentPage = Math.max(0, Math.min(totalPages - 1, index));
    container.classList.remove('swiping');
    container.style.transform = `translateX(-${currentPage * 100}vw)`;
    updateDots();
  }

  function updateDots() {
    document.querySelectorAll('.nav-dots').forEach(function (nav) {
      nav.querySelectorAll('.dot').forEach(function (dot) {
        dot.classList.toggle('active', parseInt(dot.dataset.index) === currentPage);
      });
    });
  }

  container.addEventListener('touchstart', function (e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    deltaX = 0;
    isSwiping = false;
  }, { passive: true });

  container.addEventListener('touchmove', function (e) {
    var dx = e.touches[0].clientX - startX;
    var dy = e.touches[0].clientY - startY;

    if (!isSwiping && Math.abs(dx) < 10 && Math.abs(dy) < 10) return;

    var angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    if (!isSwiping) {
      if (angle > ANGLE_THRESHOLD && angle < (180 - ANGLE_THRESHOLD)) {
        return;
      }
      isSwiping = true;
    }

    if (isSwiping) {
      deltaX = dx;
      container.classList.add('swiping');
      var offset = -currentPage * window.innerWidth + deltaX;
      container.style.transform = `translateX(${offset}px)`;
    }
  }, { passive: true });

  container.addEventListener('touchend', function () {
    if (!isSwiping) return;

    if (deltaX < -SWIPE_THRESHOLD && currentPage < totalPages - 1) {
      goToPage(currentPage + 1);
    } else if (deltaX > SWIPE_THRESHOLD && currentPage > 0) {
      goToPage(currentPage - 1);
    } else {
      goToPage(currentPage);
    }

    isSwiping = false;
    deltaX = 0;
  }, { passive: true });

  document.querySelectorAll('.nav-dots .dot').forEach(function (dot) {
    dot.addEventListener('click', function () {
      goToPage(parseInt(this.dataset.index));
    });
  });

  goToPage(0);
})();
