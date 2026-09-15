type ConfettiParticle = {
  color: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
};

const CONFETTI_COLORS = ['#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#fbbf24', '#34d399'];
const ANIMATION_DURATION_MS = 1_600;

function createParticles(width: number, height: number): ConfettiParticle[] {
  return Array.from({ length: 96 }, (_, index) => {
    const fromLeft = index % 2 === 0;
    const spread = (Math.random() - 0.5) * 4.2;

    return {
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      x: fromLeft ? width * 0.12 : width * 0.88,
      y: height * 0.78,
      velocityX: (fromLeft ? 4.5 : -4.5) + spread,
      velocityY: -8 - Math.random() * 5,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.35,
      width: 5 + Math.random() * 5,
      height: 8 + Math.random() * 7,
    };
  });
}

/** A small, dependency-free celebration for successful workflow milestones. */
export function celebrateMilestone(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;

  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    inset: '0',
    pointerEvents: 'none',
    position: 'fixed',
    zIndex: '9999',
  });
  document.body.appendChild(canvas);

  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  let particles: ConfettiParticle[] = [];

  const resize = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    canvas.width = Math.round(viewportWidth * pixelRatio);
    canvas.height = Math.round(viewportHeight * pixelRatio);
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  resize();
  particles = createParticles(viewportWidth, viewportHeight);
  window.addEventListener('resize', resize);

  const startedAt = performance.now();
  let animationFrame = 0;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
    canvas.remove();
  };

  const animate = (now: number) => {
    const progress = Math.min((now - startedAt) / ANIMATION_DURATION_MS, 1);
    context.clearRect(0, 0, viewportWidth, viewportHeight);

    for (const particle of particles) {
      particle.velocityX *= 0.985;
      particle.velocityY += 0.22;
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;
      particle.rotation += particle.rotationSpeed;

      context.save();
      context.globalAlpha = progress > 0.72 ? (1 - progress) / 0.28 : 1;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
      context.restore();
    }

    if (progress < 1) animationFrame = window.requestAnimationFrame(animate);
    else dispose();
  };

  animationFrame = window.requestAnimationFrame(animate);
  window.setTimeout(dispose, ANIMATION_DURATION_MS + 500);
}
