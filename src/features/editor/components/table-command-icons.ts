import { createLucideIcon } from "lucide-react";

// Lucide draws no icon for adding or deleting a single table row or column, so these are drawn on
// its grid and stroke to sit beside the icons it does draw.

export const AddRowAboveIcon = createLucideIcon("add-row-above", [
  ["rect", { height: "8", key: "row", rx: "2", width: "18", x: "3", y: "13" }],
  ["path", { d: "M12 3v6", key: "plus-vertical" }],
  ["path", { d: "M9 6h6", key: "plus-horizontal" }],
]);

export const AddRowBelowIcon = createLucideIcon("add-row-below", [
  ["rect", { height: "8", key: "row", rx: "2", width: "18", x: "3", y: "3" }],
  ["path", { d: "M12 15v6", key: "plus-vertical" }],
  ["path", { d: "M9 18h6", key: "plus-horizontal" }],
]);

export const AddColumnBeforeIcon = createLucideIcon("add-column-before", [
  ["rect", { height: "18", key: "column", rx: "2", width: "8", x: "13", y: "3" }],
  ["path", { d: "M3 12h6", key: "plus-horizontal" }],
  ["path", { d: "M6 9v6", key: "plus-vertical" }],
]);

export const AddColumnAfterIcon = createLucideIcon("add-column-after", [
  ["rect", { height: "18", key: "column", rx: "2", width: "8", x: "3", y: "3" }],
  ["path", { d: "M15 12h6", key: "plus-horizontal" }],
  ["path", { d: "M18 9v6", key: "plus-vertical" }],
]);

export const DeleteRowIcon = createLucideIcon("delete-row", [
  ["rect", { height: "8", key: "row", rx: "2", width: "18", x: "3", y: "3" }],
  ["path", { d: "m9.5 15.5 5 5", key: "cross-down" }],
  ["path", { d: "m14.5 15.5-5 5", key: "cross-up" }],
]);

export const DeleteColumnIcon = createLucideIcon("delete-column", [
  ["rect", { height: "18", key: "column", rx: "2", width: "8", x: "3", y: "3" }],
  ["path", { d: "m15.5 9.5 5 5", key: "cross-down" }],
  ["path", { d: "m20.5 9.5-5 5", key: "cross-up" }],
]);
