"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, ClothingItem, Forecast, Profile } from "@/lib/types";
import { CATEGORY_LABELS, findPreset, itemFromPreset, newId } from "@/lib/garments";
import { activePlan, analyzeDay } from "@/lib/weather";
import { recommendOutfits } from "@/lib/outfit";
import type { RecognizedGarment } from "@/lib/ai";
import GarmentArt, { colorFromText } from "./GarmentArt";
import { recognizeLocally } from "@/lib/localVision";

const CATS = Object.keys(CATEGORY_LABELS) as Category[];
const WARMTH = ["None", "Very light", "Light", "Medium", "Warm", "Very warm"];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

/** Downscale a photo in the browser so uploads stay small and fast. */
async function resizeImage(file: File, max = 768): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Square crop kept with the item, big enough to look sharp on cards. */
async function squarePhoto(src: string, s = 320): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const side = Math.min(img.width, img.height);
  canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, s, s);
  return canvas.toDataURL("image/jpeg", 0.78);
}

function ItemEditor({ item, onSave, onCancel }: { item: ClothingItem; onSave: (i: ClothingItem) => void; onCancel: () => void }) {
  const [d, setD] = useState(item);
  const set = <K extends keyof ClothingItem>(k: K, v: ClothingItem[K]) => setD({ ...d, [k]: v });
  return (
    <div className="card soft editor">
      <div className="grid two">
        <div className="field">
          <label>Name</label>
          <input value={d.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field">
          <label>Type</label>
          <input
            value={d.subtype}
            list="garment-types"
            onChange={(e) => {
              const p = findPreset(e.target.value);
              setD(p && p.subtype === e.target.value ? { ...d, subtype: p.subtype, category: p.category, warmth: p.warmth, waterResistance: p.waterResistance, windResistance: p.windResistance, layerable: p.layerable } : { ...d, subtype: e.target.value });
            }}
          />
        </div>
        <div className="field">
          <label>Colour</label>
          <input value={d.color ?? ""} placeholder="e.g. navy" onChange={(e) => set("color", e.target.value || undefined)} />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={d.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Material (if known)</label>
          <input value={d.material ?? ""} onChange={(e) => set("material", e.target.value || undefined)} />
        </div>
        <div className="field">
          <label>Warmth: {WARMTH[d.warmth].toLowerCase()}</label>
          <input type="range" min={0} max={5} value={d.warmth} onChange={(e) => set("warmth", Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Water</label>
          <select value={d.waterResistance} onChange={(e) => set("waterResistance", Number(e.target.value) as 0 | 1 | 2)}>
            <option value={0}>Not water resistant</option>
            <option value={1}>Water resistant (light rain)</option>
            <option value={2}>Waterproof</option>
          </select>
        </div>
        <div className="field">
          <label>Wind</label>
          <select value={d.windResistance} onChange={(e) => set("windResistance", Number(e.target.value) as 0 | 1 | 2)}>
            <option value={0}>Wind goes through</option>
            <option value={1}>Blocks some wind</option>
            <option value={2}>Windproof</option>
          </select>
        </div>
        <div className="field row">
          <input id={`lay-${d.id}`} type="checkbox" checked={d.layerable} onChange={(e) => set("layerable", e.target.checked)} />
          <label htmlFor={`lay-${d.id}`} style={{ margin: 0 }}>Easy to layer with other clothes</label>
        </div>
      </div>
      <div className="row">
        <button className="primary" onClick={() => onSave({ ...d, source: d.source === "ai" ? "ai-confirmed" : d.source })}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

interface Slide {
  item: ClothingItem;
  note: string;
}

/** 3D ring of cards. Drag with a mouse or finger, or use the arrows; it snaps to one item at a time. */
function Carousel({ slides }: { slides: Slide[] }) {
  const n = slides.length;
  const step = 360 / Math.max(n, 1);
  const radius = Math.max(120, Math.round(75 / Math.tan(Math.PI / Math.max(n, 3))) + 16);
  const [rot, setRot] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);

  const snap = (r: number) => Math.round(r / step) * step;
  const active = n ? (((-Math.round(rot / step)) % n) + n) % n : 0;
  const go = (dir: number) => setRot((r) => snap(r) - dir * step);

  return (
    <div>
      <div
        className="carousel"
        role="listbox"
        aria-label="Today's picks"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, start: rot, moved: false };
          setDragging(true);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 3) drag.current.moved = true;
          setRot(drag.current.start + dx * 0.45);
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
          setRot((r) => snap(r));
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
          setRot((r) => snap(r));
        }}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 8) go(e.deltaX > 0 ? 1 : -1);
        }}
      >
        <div className={`ring ${dragging ? "" : "anim"}`} style={{ transform: `translateZ(-${radius}px) rotateY(${rot}deg)` }}>
          {slides.map((s, i) => (
            <div
              key={s.item.id}
              className={`card3d ${i === active ? "front" : ""}`}
              role="option"
              aria-selected={i === active}
              style={{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)` }}
            >
              <GarmentArt item={s.item} size={92} />
              <strong>{s.item.name}</strong>
              <span className="small muted">{s.note}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="carousel-controls">
        <button onClick={() => go(-1)} aria-label="Previous item">←</button>
        <span className="small muted">{n ? `${active + 1} of ${n}` : ""}</span>
        <button onClick={() => go(1)} aria-label="Next item">→</button>
      </div>
    </div>
  );
}

export default function WardrobeView({
  wardrobe,
  onChange,
  aiOnline,
  profile,
  forecast,
}: {
  wardrobe: ClothingItem[];
  onChange: (w: ClothingItem[]) => void;
  aiOnline: boolean;
  profile: Profile;
  forecast: Forecast | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<ClothingItem[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Category | "all">("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFile = useRef<File | null>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const cancelLocal = useRef<(() => void) | null>(null);
  const itemPhotoRef = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<string | null>(null);

  // Bring what the AI found into view so it's easy to check.
  useEffect(() => {
    if (pending.length) pendingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pending.length]);

  // The doors swing open shortly after the closet appears.
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 120);
    return () => clearTimeout(t);
  }, []);

  const add = (items: ClothingItem[]) => onChange([...wardrobe, ...items]);
  const update = (item: ClothingItem) => onChange(wardrobe.map((i) => (i.id === item.id ? item : i)));
  const remove = (id: string) => onChange(wardrobe.filter((i) => i.id !== id));

  // Today's recommended pieces: the best outfit first, then anything the alternatives swap in.
  const slides = useMemo<Slide[]>(() => {
    if (!forecast || wardrobe.length === 0) return [];
    const date = forecast.daily[0]?.date;
    const plan = date ? activePlan(profile, date) : undefined;
    const analysis = analyzeDay(forecast, profile.preferences, plan, date);
    const result = recommendOutfits(wardrobe, analysis, profile.preferences, plan, profile.pinned?.date === date ? profile.pinned?.itemId : undefined);
    if (!result) return [];
    const seen = new Set<string>();
    const out: Slide[] = [];
    for (const p of result.primary.picks) {
      if (seen.has(p.item.id)) continue;
      seen.add(p.item.id);
      out.push({ item: p.item, note: p.slot });
    }
    for (const alt of result.alternatives) {
      for (const p of alt.picks) {
        if (seen.has(p.item.id)) continue;
        seen.add(p.item.id);
        out.push({ item: p.item, note: `${alt.title.toLowerCase().replace(/^different /, "Swap: ")}` });
      }
    }
    return out;
  }, [forecast, wardrobe, profile]);

  const quickAdd = () => {
    const name = quick.trim();
    const preset = findPreset(name);
    const color = colorFromText(name);
    if (preset) add([{ ...itemFromPreset(preset, { name }), color }]);
    else {
      // Unknown garment: add it with neutral defaults and open the editor so the user can set details.
      const item: ClothingItem = { id: newId(), name, subtype: name, category: "accessory", warmth: 1, waterResistance: 0, windResistance: 0, layerable: true, available: true, color, source: "manual" };
      add([item]);
      setEditing(item.id);
    }
    setQuick("");
  };

  const blankFromPhoto = (photo: string): ClothingItem => ({ id: newId(), name: "New item", subtype: "", category: "mid", warmth: 2, waterResistance: 0, windResistance: 0, layerable: true, available: true, photo, source: "manual" });

  const stopWaiting = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancelLocal.current?.();
  };

  /** Recognise the garment on this device with the built-in model. Returns false if that fails too. */
  const runLocal = async (aiImage: string, photo: string): Promise<boolean> => {
    setLocalStatus("Scanning…");
    try {
      const cancelled = new Promise<null>((resolve) => (cancelLocal.current = () => resolve(null)));
      const r = await Promise.race([
        recognizeLocally(aiImage, photo, (pct) =>
          setLocalStatus(pct === null ? "Scanning…" : `Getting ready… ${pct}%`),
        ),
        cancelled,
      ]);
      if (!r) {
        const item = blankFromPhoto(photo);
        setPending([item]);
        setEditing(item.id);
        setPhotoMsg("Add the details below.");
        return true;
      }
      setPending([r.item]);
      setPhotoMsg(null);
      return true;
    } catch {
      return false;
    } finally {
      cancelLocal.current = null;
      setLocalStatus(null);
    }
  };

  const onPhoto = async (file: File) => {
    lastFile.current = file;
    setFailed(false);
    setPhotoMsg(null);
    let photo: string;
    let aiImage: string;
    try {
      // Small copy for the model: vision models get much slower with bigger images.
      const big = await resizeImage(file, 640);
      photo = await squarePhoto(big);
      aiImage = await resizeImage(file, 448);
    } catch {
      setPhotoMsg("Couldn't open that photo. Try a JPG or PNG.");
      return;
    }

    const giveUp = (msg: string) => {
      const item = blankFromPhoto(photo);
      setPending([item]);
      setEditing(item.id);
      setPhotoMsg(msg);
      setFailed(true);
    };

    setBusy(true);
    try {
      if (!aiOnline) {
        // No AI server: recognise the photo right here in the browser.
        if (!(await runLocal(aiImage, photo))) giveUp("Couldn't recognise it. Add the details below.");
        return;
      }

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const timer = setTimeout(() => ctrl.abort(), 90000);
      let serverError = "";
      try {
        const res = await fetch("/api/recognize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: aiImage }), signal: ctrl.signal });
        const json = await res.json();
        const found: RecognizedGarment[] = json.items ?? [];
        if (res.ok && found.length) {
          setPending(
            found.map((g) => ({
              id: newId(),
              name: g.name,
              subtype: g.subtype,
              category: g.category,
              material: g.material,
              color: g.color ?? colorFromText(g.name),
              warmth: g.warmth,
              waterResistance: g.waterResistance,
              windResistance: g.windResistance,
              layerable: g.layerable,
              available: true,
              photo,
              source: "ai",
            })),
          );
          setPhotoMsg(null);
          return;
        }
        serverError = json.error ?? "The AI didn't spot any clothing.";
      } catch {
        if (ctrl.signal.aborted && !abortRef.current) {
          // The user tapped "Fill it in myself".
          const item = blankFromPhoto(photo);
          setPending([item]);
          setEditing(item.id);
          setPhotoMsg("Add the details below.");
          return;
        }
        serverError = "Couldn't reach the AI server.";
      } finally {
        clearTimeout(timer);
        abortRef.current = null;
      }
      // Server AI failed: fall back to the built-in model.
      // Server AI failed: fall back to the built-in model quietly (details go to the console for debugging).
      console.warn("Wearly AI server:", serverError);
      if (!(await runLocal(aiImage, photo))) giveUp("Couldn't recognise it. Add the details below.");
    } finally {
      setBusy(false);
    }
  };

  const onItemPhoto = async (file: File) => {
    const id = photoTarget.current;
    const item = wardrobe.find((i) => i.id === id);
    if (!item) return;
    try {
      const photo = await squarePhoto(await resizeImage(file));
      update({ ...item, photo });
    } catch {
      setPhotoMsg("Couldn't read that photo. Try a JPG or PNG.");
    }
  };

  const shown = wardrobe.filter((i) => filter === "all" || i.category === filter);
  const usedCats = CATS.filter((c) => wardrobe.some((i) => i.category === c));

  return (
    <div>
      <div className={`closet-stage ${open ? "open" : ""}`}>
        <div className="door left" aria-hidden><span className="knob" /></div>
        <div className="door right" aria-hidden><span className="knob" /></div>
        <div className="carousel-wrap">
          <h2 style={{ margin: "0 0 2px" }}>Today&apos;s picks</h2>
          <p className="small muted" style={{ margin: 0 }}>Spin to see each piece.</p>
          {slides.length ? (
            <Carousel slides={slides} />
          ) : (
            <p className="muted" style={{ padding: "40px 16px" }}>{wardrobe.length ? "Loading today's weather…" : "Add a few clothes below and your picks will show up here."}</p>
          )}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card confirm" ref={pendingRef}>
          <h2>Look right?</h2>
          {photoMsg && <p className="small" style={{ marginTop: 0 }}>{photoMsg}</p>}
          {pending.map((p) =>
            editing === p.id ? (
              <ItemEditor key={p.id} item={p} onSave={(i) => (setPending(pending.map((x) => (x.id === i.id ? i : x))), setEditing(null))} onCancel={() => setEditing(null)} />
            ) : (
              <div key={p.id} className="pick">
                <GarmentArt item={p} size={56} />
                <div style={{ flex: 1 }}>
                  <div>{p.name} <span className="pill info">{CATEGORY_LABELS[p.category]}</span></div>
                  <div className="small muted">Warmth {p.warmth}/5{p.waterResistance ? ` · ${p.waterResistance === 2 ? "waterproof" : "water resistant"}` : ""}</div>
                </div>
                <button onClick={() => setEditing(p.id)}>Edit</button>
                <button onClick={() => setPending(pending.filter((x) => x.id !== p.id))}>Skip</button>
              </div>
            ),
          )}
          <button className="primary" style={{ marginTop: 10 }} onClick={() => (add(pending.map((p) => ({ ...p, source: p.source === "ai" ? "ai-confirmed" : p.source }))), setPending([]), setEditing(null), setPhotoMsg(null))}>
            Add {pending.length} to closet
          </button>
        </div>
      )}

      <div className="grid two">
        <div className="card">
          <h3>Add from a photo</h3>
          <p className="small muted">Snap one piece of clothing. We fill in the details.</p>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => (e.target.files?.[0] && onPhoto(e.target.files[0]), (e.target.value = ""))} />
          <button className="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? (localStatus ?? "Scanning…") : "📷 Take or upload a photo"}
          </button>
          {busy && (
            <p className="small muted" style={{ marginTop: 8 }}>
              <button className="link small" onClick={stopWaiting}>Skip</button>
            </p>
          )}
          {photoMsg && !pending.length && (
            <p className="small" style={{ marginTop: 8 }}>
              {photoMsg}{" "}
              {failed && lastFile.current && aiOnline && !busy && <button className="link small" onClick={() => onPhoto(lastFile.current!)}>Try again</button>}
            </p>
          )}
        </div>
        <div className="card">
          <h3>Add by name</h3>
          <p className="small muted">Like &quot;grey hoodie&quot;, &quot;rain jacket&quot; or &quot;sandals&quot;.</p>
          <div className="row">
            <input list="garment-types" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && quick.trim() && quickAdd()} placeholder="e.g. grey hoodie" style={{ flex: 1, minWidth: 160 }} />
            <button className="primary" onClick={quickAdd} disabled={!quick.trim()}>Add</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>My closet ({wardrobe.length})</h2>
          <span className="small muted">Tap a picture to add your own photo.</span>
        </div>
        {usedCats.length > 1 && (
          <div className="chips" style={{ margin: "12px 0" }}>
            <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All</button>
            {usedCats.map((c) => (
              <button key={c} className={`chip ${filter === c ? "on" : ""}`} onClick={() => setFilter(c)}>{CATEGORY_LABELS[c]}</button>
            ))}
          </div>
        )}
        {wardrobe.length === 0 && <p className="muted">Nothing here yet.</p>}
        <input ref={itemPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => (e.target.files?.[0] && onItemPhoto(e.target.files[0]), (e.target.value = ""))} />
        <div className="closet-grid">
          {shown.map((i, idx) =>
            editing === i.id ? (
              <div key={i.id} style={{ gridColumn: "1 / -1" }}>
                <ItemEditor item={i} onSave={(x) => (update(x), setEditing(null))} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <div key={i.id} className={`closet-item ${i.available ? "" : "unavailable"}`} style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}>
                <button
                  className="photo-btn"
                  aria-label={`${i.photo ? "Change" : "Add"} photo of ${i.name}`}
                  onClick={() => {
                    photoTarget.current = i.id;
                    itemPhotoRef.current?.click();
                  }}
                >
                  <GarmentArt item={i} size={110} />
                </button>
                <div className="name">{i.name}</div>
                <div className="small muted">
                  {CATEGORY_LABELS[i.category]} · warmth {i.warmth}/5{i.waterResistance === 2 ? " · waterproof" : i.waterResistance ? " · water resistant" : ""}
                </div>
                <div className="actions">
                  <button className={`chip ${i.available ? "on" : ""}`} aria-pressed={i.available} title="Tap when it's in the wash" onClick={() => update({ ...i, available: !i.available })}>
                    {i.available ? "Clean" : "In wash"}
                  </button>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => setEditing(i.id)}>Edit</button>
                  <button onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}>✕</button>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
