import {
  WaiverStatus,
  type PrismaClient,
} from "@prisma/client";
import { sendEmail } from "@/lib/email/send";

type TradeOutcome = "ACCEPTED" | "REJECTED" | "COUNTERED" | "VETOED";

export interface WaiverNotificationResult {
  teamId: string;
  externalPlayerId: string;
  status: WaiverStatus;
  reason: string | null;
  faabBid: number | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageUrl(appUrl: string, path: string): string {
  return new URL(path, appUrl).toString();
}

function emailHtml({
  recipientName,
  heading,
  message,
  buttonLabel,
  url,
}: {
  recipientName: string | null;
  heading: string;
  message: string;
  buttonLabel: string;
  url: string;
}): string {
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hi,";
  const safeUrl = escapeHtml(url);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #ea580c;">Fantasy Failball</h1>
      <h2>${escapeHtml(heading)}</h2>
      <p>${greeting}</p>
      <p>${escapeHtml(message)}</p>
      <a href="${safeUrl}" style="display: inline-block; background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">${escapeHtml(buttonLabel)}</a>
      <p style="color: #666; word-break: break-all;">${safeUrl}</p>
    </div>
  `;
}

export async function notifyTradeProposal(
  db: PrismaClient,
  {
    tradeId,
    appUrl,
  }: {
    tradeId: string;
    appUrl: string;
  },
): Promise<void> {
  const trade = await db.trade.findUnique({
    where: { id: tradeId },
    select: {
      leagueId: true,
      league: { select: { name: true } },
      proposingTeam: { select: { name: true } },
      receivingTeam: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
              emailNotificationsEnabled: true,
            },
          },
        },
      },
    },
  });
  const recipient = trade?.receivingTeam.user;
  if (!trade || !recipient?.emailNotificationsEnabled) return;

  try {
    await sendEmail({
      to: recipient.email,
      subject: `Trade proposal received in ${trade.league.name}`,
      html: emailHtml({
        recipientName: recipient.name,
        heading: "New trade proposal",
        message: `${trade.proposingTeam.name} sent you a trade proposal in ${trade.league.name}.`,
        buttonLabel: "Review trade",
        url: pageUrl(appUrl, `/leagues/${trade.leagueId}/trades`),
      }),
    });
  } catch (error) {
    console.error(`Failed to send trade proposal notification for ${tradeId}:`, error);
  }
}

export async function notifyTradeOutcome(
  db: PrismaClient,
  {
    tradeId,
    outcome,
    appUrl,
  }: {
    tradeId: string;
    outcome: TradeOutcome;
    appUrl: string;
  },
): Promise<void> {
  const trade = await db.trade.findUnique({
    where: { id: tradeId },
    select: {
      leagueId: true,
      league: { select: { name: true } },
      receivingTeam: { select: { name: true } },
      proposingTeam: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
              emailNotificationsEnabled: true,
            },
          },
        },
      },
    },
  });
  const recipient = trade?.proposingTeam.user;
  if (!trade || !recipient?.emailNotificationsEnabled) return;

  const copy: Record<TradeOutcome, { subject: string; heading: string; message: string }> = {
    ACCEPTED: {
      subject: `Trade accepted in ${trade.league.name}`,
      heading: "Trade accepted",
      message: `${trade.receivingTeam.name} accepted your trade proposal.`,
    },
    REJECTED: {
      subject: `Trade rejected in ${trade.league.name}`,
      heading: "Trade rejected",
      message: `${trade.receivingTeam.name} rejected your trade proposal.`,
    },
    COUNTERED: {
      subject: `Trade countered in ${trade.league.name}`,
      heading: "Trade counteroffer received",
      message: `${trade.receivingTeam.name} sent a counteroffer to your trade proposal.`,
    },
    VETOED: {
      subject: `Trade vetoed in ${trade.league.name}`,
      heading: "Trade vetoed",
      message: `Your trade with ${trade.receivingTeam.name} was vetoed.`,
    },
  };
  const content = copy[outcome];

  try {
    await sendEmail({
      to: recipient.email,
      subject: content.subject,
      html: emailHtml({
        recipientName: recipient.name,
        heading: content.heading,
        message: content.message,
        buttonLabel: "View trades",
        url: pageUrl(appUrl, `/leagues/${trade.leagueId}/trades`),
      }),
    });
  } catch (error) {
    console.error(`Failed to send ${outcome.toLowerCase()} trade notification for ${tradeId}:`, error);
  }
}

export async function notifyWaiverResults(
  db: PrismaClient,
  {
    leagueId,
    results,
    appUrl,
  }: {
    leagueId: string;
    results: WaiverNotificationResult[];
    appUrl: string;
  },
): Promise<void> {
  if (results.length === 0) return;

  const [league, teams, players] = await Promise.all([
    db.league.findUnique({
      where: { id: leagueId },
      select: { name: true },
    }),
    db.team.findMany({
      where: { id: { in: [...new Set(results.map((result) => result.teamId))] } },
      select: {
        id: true,
        user: {
          select: {
            name: true,
            email: true,
            emailNotificationsEnabled: true,
          },
        },
      },
    }),
    db.player.findMany({
      where: {
        externalPlayerId: {
          in: [...new Set(results.map((result) => result.externalPlayerId))],
        },
      },
      select: { externalPlayerId: true, fullName: true },
    }),
  ]);
  if (!league) return;

  const recipientByTeam = new Map(teams.map((team) => [team.id, team.user]));
  const playerNameById = new Map(
    players.map((player) => [player.externalPlayerId, player.fullName]),
  );
  const url = pageUrl(appUrl, `/leagues/${leagueId}/waivers`);

  for (const result of results) {
    const recipient = recipientByTeam.get(result.teamId);
    if (!recipient?.emailNotificationsEnabled) continue;

    const playerName =
      playerNameById.get(result.externalPlayerId) ?? result.externalPlayerId;
    const approved = result.status === WaiverStatus.APPROVED;
    const bid =
      result.faabBid === null ? "" : ` with a $${result.faabBid.toFixed(2)} FAAB bid`;
    const message = approved
      ? `Your waiver claim for ${playerName}${bid} was successful.`
      : `Your waiver claim for ${playerName}${bid} failed${result.reason ? `: ${result.reason}` : "."}`;

    try {
      await sendEmail({
        to: recipient.email,
        subject: `Waiver claim ${approved ? "successful" : "failed"} in ${league.name}`,
        html: emailHtml({
          recipientName: recipient.name,
          heading: `Waiver claim ${approved ? "successful" : "failed"}`,
          message,
          buttonLabel: "View waiver results",
          url,
        }),
      });
    } catch (error) {
      console.error(`Failed to send waiver notification for ${result.externalPlayerId}:`, error);
    }
  }
}
