"use client";

import { useState } from "react";

interface EditTeamModalProps {
  leagueId: string;
  teamId: string;
  initialName: string;
  ownerEmail: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function EditTeamModal({
  leagueId,
  teamId,
  initialName,
  ownerEmail,
  onClose,
  onSaved,
}: EditTeamModalProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/leagues/${leagueId}/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update team");
      setSuccess("Team name saved.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update team");
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordReset = async () => {
    setSendingReset(true);
    setResetMessage("");
    setResetError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ownerEmail }),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to send password reset email");
      setResetMessage(payload.message || "Password reset email sent.");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Unable to send password reset email");
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit team information"
        className="w-full max-w-md rounded-lg bg-white p-6 text-slate-700 shadow-xl dark:bg-gray-800 dark:text-slate-100"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Team Information</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
        {error && <div className="mb-4 rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">{error}</div>}
        {success && <div className="mb-4 rounded bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-900/40 dark:text-green-200">{success}</div>}
        <form onSubmit={save} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Team name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={50}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
        <div className="mt-6 border-t pt-5 dark:border-gray-700">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Account</h3>
          {resetMessage && <div className="mb-4 rounded bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-900/40 dark:text-green-200">{resetMessage}</div>}
          {resetError && <div className="mb-4 rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">{resetError}</div>}
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium">Email address</span>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{ownerEmail}</p>
            </div>
            <button
              type="button"
              onClick={() => void sendPasswordReset()}
              disabled={sendingReset || !ownerEmail}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              {sendingReset ? "Sending..." : "Send password reset email"}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              A reset link will be emailed to the address above. The link expires in 1 hour.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
