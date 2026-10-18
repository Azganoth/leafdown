import { ChevronRightIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { HelpMarkdownFragment } from "@/features/help";
import { cn } from "@/lib/utils";

import {
  getReleaseChangeGroups,
  splitLeadSentence,
  type ReleaseChangeGroup,
} from "../services/releaseChanges";

const COLLAPSED_GROUP = "Fixed";

const GROUP_HEADING_CLASS =
  "flex w-full items-center gap-2 border-b pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase";

function GroupLabel({ group }: { group: ReleaseChangeGroup }) {
  return (
    <>
      {group.name}
      {group.entries.length > 0 && (
        <span
          aria-hidden
          className="rounded-full bg-muted px-1.5 py-px text-[0.6875rem] tabular-nums"
        >
          {group.entries.length}
        </span>
      )}
    </>
  );
}

export function ReleaseChangeEntry({ entry }: { entry: string }) {
  const [lead, rest] = splitLeadSentence(entry);
  return (
    <>
      {lead && (
        <span className="font-semibold text-foreground">
          <HelpMarkdownFragment inline source={lead} />
        </span>
      )}
      {lead && rest && " "}
      {rest && (
        <span className="text-foreground/80">
          <HelpMarkdownFragment inline source={rest} />
        </span>
      )}
    </>
  );
}

export function ReleaseChangeList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border/60">{children}</ul>;
}

function GroupBody({
  group,
  id,
  hidden,
}: {
  group: ReleaseChangeGroup;
  id?: string;
  hidden?: boolean;
}) {
  return (
    <div id={id} hidden={hidden}>
      {group.entries.length > 0 && (
        <ReleaseChangeList>
          {group.entries.map((entry) => (
            <li key={entry} className="py-3">
              <ReleaseChangeEntry entry={entry} />
            </li>
          ))}
        </ReleaseChangeList>
      )}
      {group.rest && <HelpMarkdownFragment source={group.rest} />}
    </div>
  );
}

function CollapsibleGroup({ group }: { group: ReleaseChangeGroup }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <section aria-label={group.name}>
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          className={cn(
            GROUP_HEADING_CLASS,
            "rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
          onClick={() => setOpen(!open)}
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3.5 transition-transform motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
          <GroupLabel group={group} />
        </button>
      </h4>
      <GroupBody group={group} id={bodyId} hidden={!open} />
    </section>
  );
}

export function ReleaseChanges({
  notes,
  collapseFixed = false,
}: {
  notes: string;
  collapseFixed?: boolean;
}) {
  return (
    <div className="space-y-8">
      {getReleaseChangeGroups(notes).map((group) =>
        collapseFixed && group.name === COLLAPSED_GROUP ? (
          <CollapsibleGroup key={group.name} group={group} />
        ) : (
          <section key={group.name} aria-label={group.name}>
            <h4 className={GROUP_HEADING_CLASS}>
              <GroupLabel group={group} />
            </h4>
            <GroupBody group={group} />
          </section>
        ),
      )}
    </div>
  );
}
