import React, { useEffect, useRef } from 'react';

/** Ambient cosmos behind the whole app — layered twinkling stars, drifting
 *  nebula, and the occasional shooting star. Pure canvas, respects
 *  prefers-reduced-motion. Part of the Midnight Observatory identity. */
export default function StarField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let stars = [];
    let neb = [];
    let shoot = null;
    let tShoot = 0;
    let raf = 0;

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      stars = [];
      const cfg = [
        [Math.round(W * H * 0.00016), 0.3, 0.8, '#b9c6e4', false],
        [Math.round(W * H * 0.0001), 0.7, 1.3, '#dfe6f5', false],
        [Math.round(W * H * 0.00004), 1.1, 2.0, '#f5edda', true],
      ];
      cfg.forEach(([n, lo, hi, tint, big]) => {
        for (let i = 0; i < n; i++) {
          stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * (hi - lo) + lo,
            tint,
            big,
            ph: Math.random() * 6.28,
            sp: 0.4 + Math.random() * 0.7,
          });
        }
      });
      neb = [
        { x: W * 0.2, y: H * 0.18, r: W * 0.55, c: 'rgba(120,90,180,0.08)' },
        { x: W * 0.86, y: H * 0.55, r: W * 0.6, c: 'rgba(60,110,160,0.07)' },
        { x: W * 0.5, y: H * 1.0, r: W * 0.6, c: 'rgba(227,189,118,0.04)' },
      ];
    };

    const frame = (now) => {
      ctx.clearRect(0, 0, W, H);
      neb.forEach((n) => {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, n.c);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
      stars.forEach((s) => {
        const tw = reduce ? 0.7 : Math.sin((now / 1000) * s.sp + s.ph) * 0.4 + 0.6;
        ctx.globalAlpha = tw;
        ctx.fillStyle = s.tint;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.3);
        ctx.fill();
        if (s.big) {
          ctx.globalAlpha = tw * 0.25;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 2.6, 0, 6.3);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
      if (!reduce) {
        if (!shoot && now > tShoot) {
          shoot = {
            x: Math.random() * W * 0.6,
            y: Math.random() * H * 0.3,
            vx: 3 + Math.random() * 1.5,
            vy: 1.5 + Math.random(),
          };
        }
        if (shoot) {
          shoot.x += shoot.vx * 2.4;
          shoot.y += shoot.vy * 2.4;
          const tail = 55;
          const g = ctx.createLinearGradient(
            shoot.x,
            shoot.y,
            shoot.x - shoot.vx * tail,
            shoot.y - shoot.vy * tail,
          );
          g.addColorStop(0, 'rgba(245,237,218,0.85)');
          g.addColorStop(1, 'transparent');
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(shoot.x, shoot.y);
          ctx.lineTo(shoot.x - shoot.vx * tail, shoot.y - shoot.vy * tail);
          ctx.stroke();
          if (shoot.x > W + 80 || shoot.y > H + 80) {
            shoot = null;
            tShoot = now + 5000 + Math.random() * 6000;
          }
        }
        raf = requestAnimationFrame(frame);
      }
    };

    build();
    raf = requestAnimationFrame(frame);
    const onResize = () => build();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={ref} className="rm-stars" aria-hidden="true" />;
}
