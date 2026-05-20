import type { WorkbenchDocumentStore } from "../stores/WorkbenchDocumentStore";
import type { WorkbenchCard } from "../types";
import { RARITY_COLORS } from "../types";

interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  card: WorkbenchCard;
  radius: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

export class GraphView {
  containerEl: HTMLElement;
  private store: WorkbenchDocumentStore;
  private svgEl: SVGSVGElement | null = null;
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private animFrame: number | null = null;
  private iterations = 0;
  private maxIterations = 200;
  private width = 800;
  private height = 600;
  private onClick: (id: string) => void;

  constructor(parentEl: HTMLElement, store: WorkbenchDocumentStore, onClick: (id: string) => void) {
    this.store = store;
    this.onClick = onClick;
    this.containerEl = parentEl.createDiv({ cls: "np-graph" });
    this.buildGraph();
    this.render();
  }

  private buildGraph(): void {
    const cards = this.store.cards.filter((card) => !card.isArchived);

    this.nodes = cards.map((card) => ({
      id: card.id,
      x: this.width * 0.2 + Math.random() * this.width * 0.6,
      y: this.height * 0.2 + Math.random() * this.height * 0.6,
      vx: 0,
      vy: 0,
      card,
      radius: card.kind === "synthesis" ? 18 : 14,
    }));

    this.edges = [];
    const nodeSet = new Set(this.nodes.map((node) => node.id));
    cards.forEach((card) => {
      (card.influencedByIds || []).forEach((targetId) => {
        if (nodeSet.has(targetId)) {
          this.edges.push({ source: card.id, target: targetId });
        }
      });
    });
  }

  render(): void {
    this.containerEl.empty();

    const cards = this.store.cards.filter((card) => !card.isArchived);
    if (cards.length === 0) {
      this.containerEl.createDiv({
        cls: "np-graph-empty",
        text: "No cards to connect yet.",
      });
      return;
    }

    const rect = this.containerEl.getBoundingClientRect();
    this.width = Math.max(400, rect.width || 800);
    this.height = Math.max(300, rect.height || 600);

    this.buildGraph();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    svg.classList.add("np-graph-svg");
    this.svgEl = svg;
    this.containerEl.appendChild(svg);

    this.iterations = 0;
    this.simulate();
  }

  private simulate(): void {
    if (this.iterations >= this.maxIterations) {
      this.drawFinal();
      return;
    }

    const alpha = 1 - this.iterations / this.maxIterations;
    const strength = 0.5 * alpha;

    for (let i = 0; i < this.nodes.length; i += 1) {
      for (let j = i + 1; j < this.nodes.length; j += 1) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (200 * strength) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    const nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    this.edges.forEach((edge) => {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) return;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 80) * 0.005 * strength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    });

    const cx = this.width / 2;
    const cy = this.height / 2;
    this.nodes.forEach((node) => {
      node.vx += (cx - node.x) * 0.001;
      node.vy += (cy - node.y) * 0.001;
    });

    this.nodes.forEach((node) => {
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(40, Math.min(this.width - 40, node.x));
      node.y = Math.max(40, Math.min(this.height - 40, node.y));
    });

    this.iterations += 1;

    if (this.iterations < this.maxIterations) {
      this.animFrame = requestAnimationFrame(() => this.simulate());
    } else {
      this.drawFinal();
    }
  }

  private drawFinal(): void {
    if (!this.svgEl) return;
    this.svgEl.innerHTML = "";

    const nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    const selectedId = this.store.selectedCardId;

    this.edges.forEach((edge) => {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) return;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(a.x));
      line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x));
      line.setAttribute("y2", String(b.y));
      line.classList.add("np-graph-edge");
      this.svgEl!.appendChild(line);
    });

    this.nodes.forEach((node) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("np-graph-node");
      if (node.id === selectedId) g.classList.add("np-graph-node--selected");

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(node.x));
      circle.setAttribute("cy", String(node.y));
      circle.setAttribute("r", String(node.radius));

      if (node.card.rarity) {
        circle.style.fill = RARITY_COLORS[node.card.rarity];
      } else if (node.card.status === "error") {
        circle.style.fill = "#f28b82";
        circle.style.stroke = "#dc2626";
        circle.style.strokeWidth = "2";
      } else if (node.card.status === "enriching") {
        circle.style.fill = "#fdd663";
        circle.style.stroke = "#d97706";
        circle.style.strokeWidth = "2";
      } else {
        circle.style.fill = "#c7d2fe";
      }

      g.appendChild(circle);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(node.x));
      text.setAttribute("y", String(node.y + node.radius + 14));
      text.classList.add("np-graph-label");
      const labelText = node.card.category || node.card.title || node.card.contentType || "note";
      text.textContent = labelText.length > 12 ? `${labelText.substring(0, 12)}...` : labelText;
      g.appendChild(text);

      g.addEventListener("click", () => this.onClick(node.id));
      g.style.cursor = "pointer";

      this.svgEl!.appendChild(g);
    });
  }

  destroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.containerEl.remove();
  }
}
