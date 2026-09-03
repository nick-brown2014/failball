"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

interface ValidationError {
  field: string;
  message: string;
}

const groups = [
  {
    title: "Roster Configuration",
    fields: [
      "rosterSize",
      "benchSize",
      "qbSlots",
      "rbSlots",
      "wrSlots",
      "teSlots",
      "flexSlots",
      "stSlots",
      "defSlots",
      "irSlots",
    ],
  },
  {
    title: "Season Configuration",
    fields: [
      "regularSeasonWeeks",
      "playoffTeams",
      "playoffStartWeek",
      "tradeDeadlineWeek",
    ],
  },
  {
    title: "Waivers",
    fields: ["waiverProcessDay", "waiverType"],
  },
  {
    title: "QB Scoring",
    fields: [
      "qbIncompletion",
      "qbInterception",
      "qbSack",
      "qbScramble",
      "qbFumble",
      "qbTouchdown",
    ],
  },
  {
    title: "RB Scoring",
    fields: [
      "rbNegativeRun",
      "rbNeutralRun",
      "rbSuccessfulRun",
      "rbExplosiveRun",
      "rbFumble",
      "rbTouchdown",
    ],
  },
  {
    title: "Pass-Catcher Scoring",
    fields: [
      "pcIncompleteTarget",
      "pcDrop",
      "pcRouteNotTargeted",
      "pcNegativeCatch",
      "pcNeutralCatch",
      "pcSuccessfulCatch",
      "pcExplosiveCatch",
      "pcFumble",
      "pcTouchdown",
    ],
  },
  {
    title: "Defense Scoring",
    fields: [
      "defTouchdownAllowed",
      "defFieldGoalAllowed",
      "defYardsAllowed0to100",
      "defYardsAllowed100to200",
      "defYardsAllowed200to300",
      "defYardsAllowed300to400",
      "defYardsAllowed400to500",
      "defYardsAllowed500plus",
      "defSack",
      "defSafety",
      "defInterception",
      "defFumbleRecovery",
      "defPickSix",
      "defFumbleReturnTd",
    ],
  },
  {
    title: "Special-Teams Scoring",
    fields: [
      "stMissedExtraPoint",
      "stMissedFieldGoal",
      "stMadeFieldGoalUnder50",
      "stMadeFieldGoalOver50",
      "stKickoffReturnTd",
      "stKickoffMuffed",
      "stKickoffStuffed",
      "stPuntReturnTd",
      "stPuntMuffed",
      "stPuntStuffed",
      "stPuntTouchback",
      "stPuntBlocked",
      "stOnsideKickFail",
      "stPenaltyExtendDrive",
    ],
  },
];

const integerFields = new Set([
  "rosterSize",
  "benchSize",
  "qbSlots",
  "rbSlots",
  "wrSlots",
  "teSlots",
  "flexSlots",
  "stSlots",
  "defSlots",
  "irSlots",
  "regularSeasonWeeks",
  "playoffTeams",
  "playoffStartWeek",
  "tradeDeadlineWeek",
  "waiverProcessDay",
]);

const labels: Record<string, string> = {};
for (const group of groups) {
  for (const field of group.fields) {
    labels[field] = field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (value) => value.toUpperCase());
  }
}

export default function LeagueSettingsPage() {
  const params = useParams<{ id: string }>();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch(`/api/leagues/${params.id}/settings`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to load settings");
        }

        setRole(data.role);
        const values: Record<string, string> = {};
        for (const group of groups) {
          for (const field of group.fields) {
            const value = data.settings[field];
            values[field] =
              field === "waiverType"
                ? value
                : String(parseFloat(String(value)));
          }
        }
        setSettings(values);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  const updateField = (field: string, value: string) => {
    setSettings({ ...settings, [field]: value });
    setFieldErrors({ ...fieldErrors, [field]: "" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    setFieldErrors({});

    const emptyFields = groups
      .flatMap((group) => group.fields)
      .filter((field) => field !== "waiverType" && !settings[field]?.trim());

    if (emptyFields.length > 0) {
      const emptyErrors: Record<string, string> = {};
      for (const field of emptyFields) {
        emptyErrors[field] = "This field is required";
      }
      setFieldErrors(emptyErrors);
      setError("Please complete all settings before saving.");
      setSaving(false);
      return;
    }

    const body: Record<string, string | number> = {};
    for (const group of groups) {
      for (const field of group.fields) {
        body[field] =
          field === "waiverType"
            ? settings[field]
            : Number(settings[field]);
      }
    }

    try {
      const response = await fetch(`/api/leagues/${params.id}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to save settings");
        const details: ValidationError[] = data.details || [];
        const nextFieldErrors: Record<string, string> = {};
        for (const detail of details) {
          nextFieldErrors[detail.field] = detail.message;
        }
        setFieldErrors(nextFieldErrors);
        return;
      }

      setSuccess("Settings saved successfully.");
      const values: Record<string, string> = {};
      for (const group of groups) {
        for (const field of group.fields) {
          values[field] =
            field === "waiverType"
              ? data.settings[field]
              : String(parseFloat(String(data.settings[field])));
        }
      }
      setSettings(values);
    } catch {
      setError("An error occurred while saving settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (error && Object.keys(settings).length === 0) {
    return (
      <div className="font-sans min-h-screen">
        <main className="container mx-auto max-w-3xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold mb-4">
            Unable to Load Settings
          </h1>
          <p className="text-red-600 mb-4">{error}</p>
          <Link href={`/leagues/${params.id}/overview`} className="text-orange-600">
            Return to league
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="font-sans min-h-screen">
      <main className="container mx-auto max-w-5xl px-4 py-8">
        <Link
          href={`/leagues/${params.id}/overview`}
          className="text-sm text-orange-600 hover:text-orange-500"
        >
          &larr; Back to League
        </Link>
        <h1 className="text-3xl font-bold mt-2 mb-2">League Settings</h1>
        {role !== "COMMISSIONER" && (
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            Only the commissioner can change league settings.
          </p>
        )}
        {success && (
          <div className="mb-4 rounded border border-green-300 bg-green-50 px-4 py-3 text-green-700">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="space-y-6">
          {groups.map((group) => (
            <section
              key={group.title}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <h2 className="text-xl font-semibold mb-4">{group.title}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.fields.map((field) => (
                  <label key={field} className="block">
                    <span className="text-sm font-medium">
                      {labels[field]}
                    </span>
                    {field === "waiverType" ? (
                      <select
                        value={settings[field] || ""}
                        disabled={role !== "COMMISSIONER"}
                        onChange={(event) =>
                          updateField(field, event.target.value)
                        }
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      >
                        <option value="ROLLING">Rolling</option>
                        <option value="FAAB">FAAB</option>
                        <option value="RESET_WEEKLY">Reset Weekly</option>
                      </select>
                    ) : (
                      <input
                        type="number"
                        step={integerFields.has(field) ? 1 : 0.01}
                        value={settings[field] || ""}
                        disabled={role !== "COMMISSIONER"}
                        onChange={(event) =>
                          updateField(field, event.target.value)
                        }
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      />
                    )}
                    {fieldErrors[field] && (
                      <span className="text-sm text-red-600">
                        {fieldErrors[field]}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </section>
          ))}
          {role === "COMMISSIONER" && (
            <button
              disabled={saving}
              className="rounded-md bg-orange-600 px-6 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
