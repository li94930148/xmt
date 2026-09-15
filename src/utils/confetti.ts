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
  delayMs: number;
  shape: 'rect' | 'circle';
};

const CONFETTI_COLORS = ['#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#fbbf24', '#34d399'];
const ANIMATION_DURATION_MS = 2_800;

function createParticles(width: number, height: number): ConfettiParticle[] {
  return Array.from({ length: 216 }, (_, index) => {
    const burst = index % 3;
    const fromLeft = burst === 0;
    const fromCenter = burst === 2;
    const direction = fromCenter ? (Math.random() - 0.5) * 13 : (fromLeft ? 6.5 : -6.5) + (Math.random() - 0.5) * 5.5;

    return {
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      x: fromCenter ? width * (0.42 + Math.random() * 0.16) : (fromLeft ? width * 0.08 : width * 0.92),
      y: fromCenter ? height * 0.6 : height * 0.88,
      velocityX: direction,
      velocityY: fromCenter ? -7 - Math.random() * 8 : -11 - Math.random() * 8,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.5,
      width: 6 + Math.random() * 7,
      height: 9 + Math.random() * 10,
      delayMs: fromCenter ? 300 + Math.random() * 180 : Math.random() * 120,
      shape: index % 5 === 0 ? 'circle' : 'rect',
    };
  });
}

/** A prominent, dependency-free celebration for successful workflow milestones. */
export function celebrateMilestone(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

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
      const particleElapsed = now - startedAt - particle.delayMs;
      if (particleElapsed < 0) continue;
      const particleProgress = Math.min(particleElapsed / (ANIMATION_DURATION_MS - particle.delayMs), 1);
      particle.velocityX *= 0.985;
      particle.velocityY += 0.2;
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;
      particle.rotation += particle.rotationSpeed;

      context.save();
      context.globalAlpha = particleProgress > 0.76 ? (1 - particleProgress) / 0.24 : 1;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      if (particle.shape === 'circle') {
        context.beginPath();
        context.arc(0, 0, particle.width / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
      }
      context.restore();
    }

    if (progress < 1) animationFrame = window.requestAnimationFrame(animate);
    else dispose();
  };

  animationFrame = window.requestAnimationFrame(animate);
  window.setTimeout(dispose, ANIMATION_DURATION_MS + 500);
}
