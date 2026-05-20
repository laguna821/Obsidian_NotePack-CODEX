import type { AnnotationResult, WorkbenchCard } from "../types";

export function getPrimaryAnnotation(card: WorkbenchCard): AnnotationResult | null {
  const readyAnnotation = card.annotations?.find((annotation) => annotation.status === "ready");
  if (readyAnnotation) return readyAnnotation;
  if (!card.annotation) return null;
  return {
    id: "legacy-primary",
    status: "ready",
    contentType: card.contentType,
    category: card.category,
    annotation: card.annotation,
    confidence: card.confidence,
    influencedByIds: card.influencedByIds,
    isUnrelated: card.isUnrelated,
    sources: card.sources,
    createdAt: card.updatedAt || card.createdAt,
  };
}

export function getVisibleAnnotations(card: WorkbenchCard): AnnotationResult[] {
  if (card.annotations && card.annotations.length > 0) return card.annotations;
  const primary = getPrimaryAnnotation(card);
  return primary ? [primary] : [];
}

export function getAnnotationPreviewText(annotation: AnnotationResult, maxLength = 80): string {
  if (annotation.status === "running") return "Generating...";
  if (annotation.status === "error") return annotation.errorMessage || "Annotation failed";
  const summary = annotation.oneLineSummary?.trim();
  if (summary) return summary.length > maxLength ? `${summary.substring(0, maxLength)}...` : summary;
  const text = annotation.annotation || "";
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
}
