import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function PhotoViewer({src, name, close}: {src:string; name:string; close:()=>void}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({x:0,y:0});
  const points = useRef(new Map<number,{x:number;y:number}>());
  const gesture = useRef<{distance:number;zoom:number}|null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const old = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow="hidden"; closeButton.current?.focus();
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape")close();};
    window.addEventListener("keydown",key);
    return ()=>{document.body.style.overflow=overflow;window.removeEventListener("keydown",key);old?.focus();};
  },[close]);
  const changeZoom=(value:number)=>{setZoom(Math.min(5,Math.max(1,value)));if(value<=1)setOffset({x:0,y:0});};
  return createPortal(<div role="dialog" aria-modal="true" aria-label={"Foto "+name} className="photo-viewer">
    <div className="photo-viewer-toolbar">
      <button ref={closeButton} onClick={close}>Tutup foto</button>
      <button onClick={()=>changeZoom(zoom-.5)} aria-label="Perkecil foto">−</button>
      <span>{Math.round(zoom*100)}%</span>
      <button onClick={()=>changeZoom(zoom+.5)} aria-label="Perbesar foto">+</button>
      <button onClick={()=>{changeZoom(1);setOffset({x:0,y:0});}}>Atur ulang</button>
    </div>
    <p>Gunakan dua jari untuk memperbesar, lalu geser foto.</p>
    <div className="photo-viewer-stage"
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.current.size===2){const [a,b]=[...points.current.values()];gesture.current={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom};}}}
      onPointerMove={e=>{const previous=points.current.get(e.pointerId);if(!previous)return;points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.current.size===2 && gesture.current){const [a,b]=[...points.current.values()];changeZoom(gesture.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/gesture.current.distance);}else if(zoom>1)setOffset(o=>({x:o.x+e.clientX-previous.x,y:o.y+e.clientY-previous.y}));}}
      onPointerUp={e=>{points.current.delete(e.pointerId);gesture.current=null;}}
      onPointerCancel={e=>{points.current.delete(e.pointerId);gesture.current=null;}}
      onDoubleClick={()=>{changeZoom(zoom>1?1:2);setOffset({x:0,y:0});}}>
      <img src={src} alt={"Foto "+name} draggable={false} style={{transform:`translate(${offset.x}px, ${offset.y}px) scale(${zoom})`}} />
    </div>
  </div>,document.body);
}
