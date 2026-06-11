// Snap Spacing to Variable — live watcher
// Launch once per file session. Pick a collection, leave it running.
// Every auto layout you create (Shift+A) or spacing you edit gets its
// gap + paddings bound to the nearest FLOAT variable in that collection.

const STORAGE_KEY = "snap-spacing-collection-id";
const FIELDS = [
  "itemSpacing",
  "counterAxisSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
];

let candidates = []; // [{ variable, value }]
let busy = false;    // re-entrancy guard: our own edits fire documentchange too

async function loadCandidates(collectionId) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection) return null;
  const modeId = collection.defaultModeId;
  const out = [];
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v || v.resolvedType !== "FLOAT") continue;
    const raw = v.valuesByMode[modeId];
    if (typeof raw === "number") out.push({ variable: v, value: raw });
  }
  out.sort((a, b) => a.value - b.value);
  return { name: collection.name, list: out };
}

function nearest(value) {
  let best = null, bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c.value - value);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function snapNode(node) {
  if (!("layoutMode" in node) || node.layoutMode === "NONE") return 0;
  let changed = 0;
  for (const field of FIELDS) {
    // gap set to "Auto" = SPACE_BETWEEN; binding itemSpacing would override it
    if (field === "itemSpacing" && node.primaryAxisAlignItems === "SPACE_BETWEEN") continue;
    // counterAxisSpacing only exists meaningfully when wrap is on, and can also be Auto
    if (field === "counterAxisSpacing") {
      if (node.layoutWrap !== "WRAP") continue;
      if (node.counterAxisAlignContent === "SPACE_BETWEEN") continue;
    }
    const current = node[field];
    if (typeof current !== "number") continue;
    const bound = node.boundVariables && node.boundVariables[field];
    const target = nearest(current);
    if (!target) continue;
    // already bound to the right variable -> skip
    if (bound && bound.id === target.variable.id) continue;
    // exact raw match or needs snapping -> bind either way
    try {
      node.setBoundVariable(field, target.variable);
      changed++;
    } catch (e) {
      // some node states reject binding; ignore
    }
  }
  return changed;
}

function onDocumentChange(event) {
  if (busy || candidates.length === 0) return;
  busy = true;
  let total = 0;
  try {
    const seen = new Set();
    for (const change of event.documentChanges) {
      if (change.type !== "CREATE" && change.type !== "PROPERTY_CHANGE") continue;
      const node = change.node;
      if (!node || node.removed || seen.has(node.id)) continue;
      if (change.type === "PROPERTY_CHANGE") {
        const relevant = change.properties.some((p) =>
          FIELDS.includes(p) || p === "layoutMode"
        );
        if (!relevant) continue;
      }
      seen.add(node.id);
      total += snapNode(node);
    }
  } finally {
    busy = false;
  }
  if (total > 0) {
    figma.ui.postMessage({ type: "snapped", count: total });
  }
}

async function startWatching(collectionId) {
  const result = await loadCandidates(collectionId);
  if (!result || result.list.length === 0) {
    figma.ui.postMessage({ type: "error", message: "No number variables in that collection." });
    return;
  }
  candidates = result.list;
  await figma.clientStorage.setAsync(STORAGE_KEY, collectionId);
  figma.on("documentchange", onDocumentChange);
  figma.ui.postMessage({
    type: "watching",
    collection: result.name,
    count: candidates.length,
  });
}

async function init() {
  await figma.loadAllPagesAsync(); // required for documentchange with dynamic-page
  figma.showUI(__html__, { width: 260, height: 150 });

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const saved = await figma.clientStorage.getAsync(STORAGE_KEY);
  figma.ui.postMessage({
    type: "collections",
    collections: collections.map((c) => ({ id: c.id, name: c.name })),
    saved: saved || null,
  });

  figma.ui.onmessage = async (msg) => {
    if (msg.type === "start") await startWatching(msg.collectionId);
    if (msg.type === "snap-selection") {
      // manual catch-up pass over current selection (incl. nested auto layouts)
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({ type: "error", message: "Nothing selected." });
        return;
      }
      let total = 0;
      busy = true;
      for (const root of selection) {
        total += snapNode(root);
        if ("findAll" in root) {
          for (const node of root.findAll((n) => "layoutMode" in n && n.layoutMode !== "NONE")) {
            total += snapNode(node);
          }
        }
      }
      busy = false;
      figma.ui.postMessage({ type: "snapped", count: total });
    }
  };
}

init();
