"use client";

import { useRef, useState } from "react";
import type { Category, ClothingItem } from "@/lib/types";
import { CATEGORY_LABELS, GARMENT_PRESETS, findPreset, itemFromPreset, newId } from "@/lib/garments";
import type { RecognizedGarment } from "@/lib/ai";
import { ItemThumb } from "./TodayView";

const CATS = Object.keys(CATEGORY_LABELS) as Category[];
const WARMTH = ["None", "Very light", "Light", "Medium", "Warm", "Very warm"];

/** Downscale a photo in the browser so uploads stay small and fast. */
async function resizeImage(file: File, max = 768): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
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

async function thumbnail(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.src = dataUrl;
  });
  const s = 96;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const side = Math.min(img.width, img.height);
  canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, s, s);
  return canvas.toDataURL("image/jpeg", 0.7);
}

function ItemEditor({ item, onSave, onCancel }: { item: ClothingItem; onSave: (i: ClothingItem) => void; onCancel: () => void }) {
  const [d, setD] = useState(item);
  const set = <K extends keyof ClothingItem>(k: K, v: ClothingItem[K]) => setD({ ...d, [k]: v });
  return (
    <div className="card soft">
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
          <label>Warmth: {WARMTH[d.warmth]}</label>
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

export default function WardrobeView({ wardrobe, onChange, aiOnline }: { wardrobe: ClothingItem[]; onChange: (w: ClothingItem[]) => void; aiOnline: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<ClothingItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (items: ClothingItem[]) => onChange([...wardrobe, ...items]);
  const update = (item: ClothingItem) => onChange(wardrobe.map((i) => (i.id === item.id ? item : i)));
  const remove = (id: string) => onChange(wardrobe.filter((i) => i.id !== id));

  const quickAdd = () => {
    const preset = findPreset(quick);
    if (preset) add([itemFromPreset(preset, { name: quick.trim() })]);
    else {
      // Unknown garment: add it with neutral defaults and open the editor so the user can set details.
      const item: ClothingItem = { id: newId(), name: quick.trim(), subtype: quick.trim(), category: "accessory", warmth: 1, waterResistance: 0, windResistance: 0, layerable: true, available: true, source: "manual" };
      add([item]);
      setEditing(item.id);
    }
    setQuick("");
  };

  const onPhoto = async (file: File) => {
    setBusy(true);
    setPhotoMsg(null);
    try {
      const image = await resizeImage(file);
      const thumb = await thumbnail(image);
      const res = await fetch("/api/recognize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }) });
      const json = await res.json();
      const found: RecognizedGarment[] = json.items ?? [];
      if (!res.ok || found.length === 0) {
        setPhotoMsg(json.error ?? "We couldn't spot any clothing in that photo. Try a photo of one item on a plain background, or add it by name.");
        // Still keep the photo: create a blank item the user can describe.
        const item: ClothingItem = { id: newId(), name: "New item", subtype: "", category: "mid", warmth: 2, waterResistance: 0, windResistance: 0, layerable: true, available: true, photo: thumb, source: "manual" };
        setPending([item]);
        setEditing(item.id);
      } else {
        setPending(
          found.map((g) => ({
            id: newId(),
            name: g.name,
            subtype: g.subtype,
            category: g.category,
            material: g.material,
            warmth: g.warmth,
            waterResistance: g.waterResistance,
            windResistance: g.windResistance,
            layerable: g.layerable,
            available: true,
            photo: thumb,
            source: "ai",
          })),
        );
        setPhotoMsg(`Found ${found.length} item${found.length > 1 ? "s" : ""} using ${json.model}. Check the details and fix anything that's wrong.`);
      }
    } catch {
      setPhotoMsg("Couldn't process that photo. You can add the item by name instead.");
    }
    setBusy(false);
  };

  const grouped = CATS.map((c) => [c, wardrobe.filter((i) => i.category === c)] as const).filter(([, items]) => items.length);

  return (
    <div>
      <datalist id="garment-types">
        {GARMENT_PRESETS.map((p) => <option key={p.subtype} value={p.subtype} />)}
      </datalist>
      <div className="grid two">
        <div className="card">
          <h2>Add from a photo</h2>
          <p className="small muted">The open-weight vision model identifies the garment and suggests warmth and weather protection. You can correct anything.</p>
          <div className="drop">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
            <button className="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "Looking at your photo…" : "📷 Take or upload a photo"}
            </button>
            {!aiOnline && <p className="small muted" style={{ marginTop: 8 }}>The model server looks offline, so photos will be saved for you to describe by hand.</p>}
          </div>
          {photoMsg && <p className="small" style={{ marginTop: 8 }}>{photoMsg}</p>}
        </div>
        <div className="card">
          <h2>Add by name</h2>
          <p className="small muted">Type what it is, like &quot;hoodie&quot;, &quot;rain jacket&quot; or &quot;winter boots&quot;. We fill in sensible details.</p>
          <div className="row">
            <input list="garment-types" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && quick.trim() && quickAdd()} placeholder="e.g. grey hoodie" style={{ flex: 1, minWidth: 160 }} />
            <button className="primary" onClick={quickAdd} disabled={!quick.trim()}>Add</button>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card">
          <h2>Confirm new items</h2>
          {pending.map((p) =>
            editing === p.id ? (
              <ItemEditor key={p.id} item={p} onSave={(i) => (setPending(pending.map((x) => (x.id === i.id ? i : x))), setEditing(null))} onCancel={() => setEditing(null)} />
            ) : (
              <div key={p.id} className="pick">
                <ItemThumb item={p} />
                <div style={{ flex: 1 }}>
                  <div>{p.name} <span className="pill info">{CATEGORY_LABELS[p.category]}</span></div>
                  <div className="small muted">Warmth {WARMTH[p.warmth]} · {["not water resistant", "water resistant", "waterproof"][p.waterResistance]}{p.material ? ` · ${p.material}` : ""}</div>
                </div>
                <button onClick={() => setEditing(p.id)}>Edit</button>
                <button onClick={() => setPending(pending.filter((x) => x.id !== p.id))}>Skip</button>
              </div>
            ),
          )}
          <button className="primary" style={{ marginTop: 10 }} onClick={() => (add(pending.map((p) => ({ ...p, source: p.source === "ai" ? "ai-confirmed" : p.source }))), setPending([]), setEditing(null), setPhotoMsg(null))}>
            Add {pending.length} to wardrobe
          </button>
        </div>
      )}

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Your wardrobe ({wardrobe.length})</h2>
          <span className="small muted">Untick items that are in the wash or not available.</span>
        </div>
        {wardrobe.length === 0 && <p className="muted">Nothing here yet.</p>}
        {grouped.map(([cat, items]) => (
          <div key={cat} style={{ marginTop: 12 }}>
            <h3>{CATEGORY_LABELS[cat]}</h3>
            {items.map((i) =>
              editing === i.id ? (
                <ItemEditor key={i.id} item={i} onSave={(x) => (update(x), setEditing(null))} onCancel={() => setEditing(null)} />
              ) : (
                <div key={i.id} className={`pick item-card ${i.available ? "" : "unavailable"}`}>
                  <input type="checkbox" checked={i.available} onChange={(e) => update({ ...i, available: e.target.checked })} title="Available today" />
                  <ItemThumb item={i} />
                  <div style={{ flex: 1 }}>
                    <div>{i.name}</div>
                    <div className="small muted">
                      {i.subtype} · warmth {i.warmth}/5{i.waterResistance ? ` · ${i.waterResistance === 2 ? "waterproof" : "water resistant"}` : ""}{i.windResistance === 2 ? " · windproof" : ""}
                    </div>
                  </div>
                  <button onClick={() => setEditing(i.id)}>Edit</button>
                  <button onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}>✕</button>
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
