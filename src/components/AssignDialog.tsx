import { useState } from 'react';
import { ApiError, errorMessage } from '../lib/api';
import { desk } from '../lib/desk';
import { ROLE_LABEL, fromLocalInput, toLocalInput } from '../lib/format';
import type { Author, Workflow } from '../lib/types';
import { Button, Dialog, SelectInput, TextArea, TextInput, useToast } from './ui';

export interface Assignable {
  id: number;
  headline: string;
  assigned_to: number | null;
  deadline: string | null;
  brief: string;
}

/** An editor gives a story to a reporter: who, by when, and what is wanted. With no story, it starts a new one. */
export function AssignDialog({ people, story, onDone, onClose }: { people: Author[]; story: Assignable | null; onDone: (result: { id: number; workflow: Workflow | null }) => void; onClose: () => void }) {
  const toast = useToast();
  const [headline, setHeadline] = useState('');
  const [to, setTo] = useState(story?.assigned_to ? String(story.assigned_to) : '');
  const [deadline, setDeadline] = useState(story?.deadline ? toLocalInput(story.deadline) : '');
  const [brief, setBrief] = useState(story?.brief ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const found: Record<string, string> = {};
    if (!story && headline.trim().length < 4) found.headline = 'Give the story a working headline (at least 4 characters).';
    if (!story && !to) found.assigned_to = 'Choose who will write it.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const result = await desk<{ id: number; workflow: Workflow | null }>('assign', {
        ...(story ? { id: story.id } : { headline }),
        assigned_to: to ? Number(to) : null,
        deadline: deadline ? fromLocalInput(deadline) : '',
        brief,
      });
      const name = people.find((p) => String(p.id) === to)?.name;
      toast(name ? `Assigned to ${name}. They have been told in Mail.` : 'The assignment has been taken off.');
      onDone(result);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title={story ? 'Assign this story' : 'New assignment'}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="assign-form" loading={busy}>
            {story ? 'Save assignment' : 'Assign story'}
          </Button>
        </>
      }
    >
      <form
        id="assign-form"
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {story ? (
          <p className="text-[16px] leading-snug font-extrabold text-ink">{story.headline}</p>
        ) : (
          <TextInput
            label="Working headline"
            maxLength={140}
            autoComplete="off"
            disabled={busy}
            value={headline}
            onChange={(e) => (setHeadline(e.target.value), setErrors({}))}
            error={errors.headline}
            hint="A draft with this headline is started for the reporter. They can change it."
          />
        )}
        <SelectInput label="Reporter" disabled={busy} value={to} onChange={(e) => (setTo(e.target.value), setErrors({}))} error={errors.assigned_to}>
          <option value="">{story ? 'Nobody (take the assignment off)' : 'Choose a person'}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {ROLE_LABEL[p.role]}
            </option>
          ))}
        </SelectInput>
        <TextInput
          label="Deadline"
          optional
          type="datetime-local"
          disabled={busy || (Boolean(story) && !to)}
          value={deadline}
          onChange={(e) => (setDeadline(e.target.value), setErrors({}))}
          error={errors.deadline}
          hint="In your own time zone. It shows on the calendar and on the dashboard."
        />
        <TextArea
          label="Brief"
          optional
          rows={4}
          maxLength={2000}
          disabled={busy || (Boolean(story) && !to)}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          hint="What the story should cover, who to speak to, how long it should run."
          className="resize-y"
        />
      </form>
    </Dialog>
  );
}
