// Thẻ chuyến đi + modal "Xuất kế hoạch" (T-82). Chỉ import động từ CalendarColumn để `html-to-image` không vào entry bundle.
export { ExportPlanModal } from './ExportPlanModal';
export type { ExportPlanModalProps } from './ExportPlanModal';
export { TripCard, MAX_CARD_STOPS, MAX_CARD_AVATARS } from './TripCard';
export type { CardPalette, TripCardProps } from './TripCard';
export { cardFileName, renderCardPng, CARD_WIDTH, CARD_HEIGHT } from './exportCard';
export { routeSketch } from './routeSketch';
export type { RouteSketch, SketchInput, SketchNode } from './routeSketch';
export { buildPlanText, shortAddress, limitList, legLine, describeLongDate, sortPlanItems } from './planText';
export type { PlanLeg, PlanFeasibility, PlanTextInput } from './planText';
