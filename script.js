// Smooth scroll for navbar links
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if(target) {
      window.scrollTo({
        top: target.offsetTop - 70,
        behavior: 'smooth'
      });
    }
  });
});

// Hero floating shapes animation
const hero = document.querySelector('.hero');
const createShape = () => {
  const shape = document.createElement('div');
  shape.classList.add('floating-shape');
  shape.style.left = Math.random() * 100 + '%';
  shape.style.width = shape.style.height = Math.random() * 60 + 20 + 'px';
  shape.style.animationDuration = Math.random() * 5 + 3 + 's';
  hero.appendChild(shape);
  setTimeout(() => hero.removeChild(shape), 8000);
};
setInterval(createShape, 1000);

// Testimonials pop-up animation on scroll
const testimonials = document.querySelectorAll('.testimonial');
const showTestimonials = () => {
  const triggerBottom = window.innerHeight / 1.2;
  testimonials.forEach(testimonial => {
    const top = testimonial.getBoundingClientRect().top;
    if(top < triggerBottom) {
      testimonial.style.opacity = 1;
      testimonial.style.transform = 'translateY(0)';
    }
  });
};
window.addEventListener('scroll', showTestimonials);
showTestimonials();

// Features hover effect (optional extra animation)
const features = document.querySelectorAll('.feature');
features.forEach(feature => {
  feature.addEventListener('mouseenter', () => {
    feature.style.transform = 'translateY(-10px) scale(1.05)';
    feature.style.boxShadow = '0 25px 50px rgba(0,0,0,0.2)';
  });
  feature.addEventListener('mouseleave', () => {
    feature.style.transform = 'translateY(0) scale(1)';
    feature.style.boxShadow = '0 10px 30px rgba(0,0,0,0.08)';
  });
});
