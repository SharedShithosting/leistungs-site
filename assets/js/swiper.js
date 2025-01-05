const swiper = new Swiper('.swiper', {
  // Optional parameters
  loop: true,

  // If we need pagination
  pagination: {
    el: '.swiper-pagination',
  },

  // Navigation arrows
  navigation: {
    nextEl: '.swiper-button-next',
    prevEl: '.swiper-button-prev',
  },
  effect: "cards",

});

document.addEventListener('DOMContentLoaded', function() {
  swiper.update();
});

document.getElementById("intro").addEventListener("click", function () {
  swiper.update();
});