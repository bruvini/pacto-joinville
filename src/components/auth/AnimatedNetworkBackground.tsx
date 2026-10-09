import { useEffect, useRef } from "react";

type No = { x: number; y: number; vx: number; vy: number; raio: number; destaque: boolean };

/**
 * Rede de conexões de baixa densidade, independente do estado do login.
 * Canvas não intercepta eventos; respeita preferência de movimento reduzido,
 * pausa em abas ocultas e limita DPI/FPS para não prejudicar o formulário.
 */
export function AnimatedNetworkBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const contexto = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !contexto) return;

    const midia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const nos: No[] = [];
    let quadro = 0;
    let largura = 0;
    let altura = 0;
    let ultimoQuadro = 0;
    let anterior = 0;

    const sortear = (indice: number, sal: number) => {
      const valor = Math.sin((indice + 1) * 127.1 + sal * 311.7) * 43758.5453;
      return valor - Math.floor(valor);
    };

    const redimensionar = () => {
      const rect = canvas.getBoundingClientRect();
      largura = Math.max(1, rect.width);
      altura = Math.max(1, rect.height);
      const dpi = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.ceil(largura * dpi);
      canvas.height = Math.ceil(altura * dpi);
      contexto.setTransform(dpi, 0, 0, dpi, 0, 0);

      const quantidade = Math.min(38, Math.max(14, Math.round((largura * altura) / 36000)));
      nos.length = 0;
      for (let i = 0; i < quantidade; i++) {
        const angulo = sortear(i, 3) * Math.PI * 2;
        const velocidade = 0.12 + sortear(i, 4) * 0.17; // px a cada ~16 ms
        nos.push({
          x: sortear(i, 1) * largura,
          y: sortear(i, 2) * altura,
          vx: Math.cos(angulo) * velocidade,
          vy: Math.sin(angulo) * velocidade,
          raio: 2.4 + sortear(i, 5) * 4,
          destaque: i % 9 === 0,
        });
      }
      anterior = 0;
      desenhar(0);
    };

    const desenhar = (tempo: number) => {
      contexto.clearRect(0, 0, largura, altura);
      const alcance = largura < 700 ? 170 : 235;

      for (let i = 0; i < nos.length; i++) {
        for (let j = i + 1; j < nos.length; j++) {
          const a = nos[i], b = nos[j];
          const distancia = Math.hypot(a.x - b.x, a.y - b.y);
          if (distancia >= alcance) continue;
          const opacidade = (1 - distancia / alcance) * 0.21;
          contexto.strokeStyle = `rgba(200,229,249,${opacidade})`;
          contexto.lineWidth = 1;
          contexto.beginPath();
          contexto.moveTo(a.x, a.y);
          contexto.lineTo(b.x, b.y);
          contexto.stroke();
        }
      }

      for (let i = 0; i < nos.length; i++) {
        const no = nos[i];
        const pulsar = midia.matches ? 1 : (1 + 0.13 * Math.sin(tempo / 1600 + i));
        contexto.beginPath();
        contexto.arc(no.x, no.y, no.raio * pulsar, 0, Math.PI * 2);
        contexto.fillStyle = no.destaque ? "rgba(143,194,62,0.50)" : "rgba(202,227,248,0.37)";
        contexto.fill();
      }
    };

    const animar = (tempo: number) => {
      if (document.hidden || midia.matches) {
        quadro = 0;
        desenhar(tempo);
        return;
      }
      quadro = requestAnimationFrame(animar);
      if (tempo - ultimoQuadro < 33) return; // no máximo 30 fps
      const delta = anterior ? Math.min((tempo - anterior) / 16.67, 2.5) : 1;
      anterior = tempo;
      ultimoQuadro = tempo;
      for (const no of nos) {
        no.x += no.vx * delta;
        no.y += no.vy * delta;
        if (no.x < 0 || no.x > largura) no.vx *= -1;
        if (no.y < 0 || no.y > altura) no.vy *= -1;
        no.x = Math.max(0, Math.min(largura, no.x));
        no.y = Math.max(0, Math.min(altura, no.y));
      }
      desenhar(tempo);
    };

    const reativar = () => {
      cancelAnimationFrame(quadro);
      quadro = 0;
      anterior = 0;
      ultimoQuadro = 0;
      if (document.hidden || midia.matches) {
        desenhar(0);
      } else {
        quadro = requestAnimationFrame(animar);
      }
    };
    const observer = new ResizeObserver(() => {
      redimensionar();
      reativar();
    });
    observer.observe(canvas);
    midia.addEventListener("change", reativar);
    document.addEventListener("visibilitychange", reativar);
    redimensionar();
    reativar();

    return () => {
      observer.disconnect();
      midia.removeEventListener("change", reativar);
      document.removeEventListener("visibilitychange", reativar);
      cancelAnimationFrame(quadro);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
