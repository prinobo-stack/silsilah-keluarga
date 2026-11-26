import { useLayoutEffect, useRef } from "react";
import { dateText, resolveAddress, type Person, type State } from "./domain";

export default function TreeMemberTip({anchor, person, state, publicView, scale}: {
  anchor: SVGGElement; person: Person; state: State; publicView: boolean; scale: number;
}) {
  const tip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = tip.current;
    const viewport = anchor.closest(".tree-viewport");
    if (!el || !viewport) return;
    function position() {
      if (!el || !viewport) return;
      const r = anchor.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
      const left = Math.max(0, bounds.left), right = Math.min(window.innerWidth, bounds.right);
      const top = Math.max(0, bounds.top), bottom = Math.min(window.innerHeight, bounds.bottom);
      const visible = anchor.isConnected && r.right > left && r.left < right && r.bottom > top && r.top < bottom;
      el.style.visibility = visible ? "visible" : "hidden";
      const x = r.right + 10 + el.offsetWidth <= window.innerWidth ? r.right + 10 : r.left - el.offsetWidth - 10;
      el.style.left = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, x)) + "px";
      el.style.top = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, Math.max(r.top, top))) + "px";
    }
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [anchor, scale, person, state, publicView]);

  const birth = [person.place, person.birth && (person.birthApprox ? "sekitar " : "") + dateText(person.birth)].filter(Boolean).join(", ");
  return <div ref={tip} id="tree-member-tip" className="tree-member-tip" role="tooltip">
    <strong>{person.name}</strong>
    {person.nickname && <div>Panggilan · {person.nickname}</div>}
    {!publicView && <>
      {birth && <div>Lahir · {birth}</div>}
      <div>Alamat · {resolveAddress(state, person.id).address || "Belum diisi"}</div>
    </>}
    {person.status === "deceased" && <div>Sudah wafat</div>}
  </div>;
}
