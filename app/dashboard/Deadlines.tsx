"use client";

import { useMemo, useState } from "react";
import { formatIST, relative } from "@/lib/time";

export type UiItem = {
  id: string;
  kind: "assignment" | "quiz";
  subject: string;
  code: string | null;
  title: string;
  due: string;
  completed: boolean;
  note: string | null;
};

type View = "upcoming" | "overdue" | "done";
type Kind = "all" | "assignment" | "quiz";

const H = 3_600_000;

export default function Deadlines({ items, nowIso }: { items: UiItem[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [view, setView] = useState<View>("upcoming");
  const [kind, setKind] = useState<Kind>("all");

  const buckets = useMemo(() => {
    const k = items.filter((i) => kind === "all" || i.kind === kind);
    const t = now.getTime();
    return {
      upcoming: k.filter((i) => !i.completed && +new Date(i.due) > t).sort((a, b) => +new Date(a.due) - +new Date(b.due)),
      overdue: k.filter((i) => !i.completed && +new Date(i.due) <= t).sort((a, b) => +new Date(b.due) - +new Date(a.due)),
      done: k.filter((i) => i.completed).sort((a, b) => +new Date(b.due) - +new Date(a.due)),
    };
  }, [items, kind, now]);

  const t = now.getTime();
  const pending = items.filter((i) => !i.completed);
  const stats = {
    day: pending.filter((i) => +new Date(i.due) > t && +new Date(i.due) - t <= 24 * H).length,
    week: pending.filter((i) => +new Date(i.due) > t && +new Date(i.due) - t <= 7 * 24 * H).length,
    overdue: pending.filter((i) => +new Date(i.due) <= t).length,
    done: items.filter((i) => i.completed).length,
  };

  const list = buckets[view];

  // Group upcoming items by urgency
  const groups: { label: string; items: UiItem[] }[] =
    view === "upcoming"
      ? [
          { label: "Next 24 hours", items: list.filter((i) => +new Date(i.due) - t <= 24 * H) },
          { label: "Next 7 days", items: list.filter((i) => +new Date(i.due) - t > 24 * H && +new Date(i.due) - t <= 7 * 24 * H) },
          { label: "Later", items: list.filter((i) => +new Date(i.due) - t > 7 * 24 * H) },
        ].filter((g) => g.items.length)
      : [{ label: "", items: list }];

  return (
    <section>
      <div className="stats">
        <div className={`stat ${stats.day ? "red" : ""}`}><div className="v">{stats.day}</div><div className="l">Due in 24 hours</div></div>
        <div className={`stat ${stats.week ? "amber" : ""}`}><div className="v">{stats.week}</div><div className="l">Due this week</div></div>
        <div className="stat"><div className="v">{stats.overdue}</div><div className="l">Missed / overdue</div></div>
        <div className="stat"><div className="v">{stats.done}</div><div className="l">Submitted / attempted</div></div>
      </div>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Status">
          {(["upcoming", "overdue", "done"] as View[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "upcoming" ? "Upcoming" : v === "overdue" ? "Overdue" : "Done"}
              <span className="c">{buckets[v].length}</span>
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Type">
          {(["all", "assignment", "quiz"] as Kind[]).map((k) => (
            <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === "all" ? "All" : k === "assignment" ? "Assignments" : "Quizzes"}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          {view === "upcoming" ? "Nothing pending. You're all caught up 🎉" : view === "overdue" ? "Nothing overdue." : "Nothing here yet."}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.label || "all"}>
            {g.label && <div className="group-h">{g.label}</div>}
            <div className="list">
              {g.items.map((i) => (
                <Row key={i.id} item={i} now={now} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Row({ item, now }: { item: UiItem; now: Date }) {
  const due = new Date(item.due);
  const left = due.getTime() - now.getTime();
  const cls = item.completed ? "done" : left <= 0 ? "" : left <= 24 * H ? "urgent" : left <= 72 * H ? "soon" : "later";
  return (
    <div className={`item ${cls}`}>
      <div className="bar" />
      <div>
        <div className="meta">
          <span className={`tag ${item.kind}`}>{item.kind === "quiz" ? "Quiz" : "Assignment"}</span>
          <span>{item.subject}{item.code ? ` · ${item.code}` : ""}</span>
        </div>
        <div className="title">{item.title}</div>
        {item.note && <div className="note">{item.note}</div>}
      </div>
      <div className="when">
        <b>{item.completed ? (item.kind === "quiz" ? "Attempted" : "Submitted") : relative(due, now)}</b>
        {formatIST(due)}
      </div>
    </div>
  );
}
