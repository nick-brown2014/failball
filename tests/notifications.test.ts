import {
  WaiverStatus,
  type PrismaClient,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyTradeOutcome,
  notifyTradeProposal,
  notifyWaiverResults,
} from "@/lib/email/notifications";
import { sendEmail } from "@/lib/email/send";

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(),
}));

const sendEmailMock = vi.mocked(sendEmail);
const appUrl = "https://failball.example";

function tradeDb({
  notificationsEnabled = true,
}: {
  notificationsEnabled?: boolean;
} = {}) {
  return {
    trade: {
      findUnique: vi.fn(async () => ({
        leagueId: "league-1",
        league: { name: "Basement Bowl" },
        proposingTeam: {
          name: "Turnover Factory",
          user: {
            name: "Pat Proposer",
            email: "proposer@example.com",
            emailNotificationsEnabled: notificationsEnabled,
          },
        },
        receivingTeam: {
          name: "Sack Attack",
          user: {
            name: "Riley Receiver",
            email: "receiver@example.com",
            emailNotificationsEnabled: notificationsEnabled,
          },
        },
      })),
    },
  } as unknown as PrismaClient;
}

describe("trade email notifications", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(true);
  });

  it("emails the receiving owner when a trade is proposed", async () => {
    await notifyTradeProposal(tradeDb(), {
      tradeId: "trade-1",
      appUrl,
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "receiver@example.com",
        subject: "Trade proposal received in Basement Bowl",
        html: expect.stringContaining(
          "https://failball.example/leagues/league-1/trades",
        ),
      }),
    );
  });

  it.each([
    ["ACCEPTED", "Trade accepted in Basement Bowl"],
    ["REJECTED", "Trade rejected in Basement Bowl"],
    ["COUNTERED", "Trade countered in Basement Bowl"],
    ["VETOED", "Trade vetoed in Basement Bowl"],
  ] as const)("emails the proposer when a trade is %s", async (outcome, subject) => {
    await notifyTradeOutcome(tradeDb(), {
      tradeId: "trade-1",
      outcome,
      appUrl,
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "proposer@example.com",
        subject,
      }),
    );
  });

  it("honors the user's email preference", async () => {
    await notifyTradeProposal(tradeDb({ notificationsEnabled: false }), {
      tradeId: "trade-1",
      appUrl,
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("waiver email notifications", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(true);
  });

  it("emails each team owner with successful and failed claim results", async () => {
    const db = {
      league: {
        findUnique: vi.fn(async () => ({ name: "Basement Bowl" })),
      },
      team: {
        findMany: vi.fn(async () => [
          {
            id: "team-1",
            user: {
              name: "Alex",
              email: "alex@example.com",
              emailNotificationsEnabled: true,
            },
          },
          {
            id: "team-2",
            user: {
              name: "Sam",
              email: "sam@example.com",
              emailNotificationsEnabled: true,
            },
          },
        ]),
      },
      player: {
        findMany: vi.fn(async () => [
          { externalPlayerId: "player-1", fullName: "Bad Quarterback" },
          { externalPlayerId: "player-2", fullName: "Good Receiver" },
        ]),
      },
    } as unknown as PrismaClient;

    await notifyWaiverResults(db, {
      leagueId: "league-1",
      appUrl,
      results: [
        {
          teamId: "team-1",
          externalPlayerId: "player-1",
          status: WaiverStatus.APPROVED,
          reason: null,
          faabBid: 12,
        },
        {
          teamId: "team-2",
          externalPlayerId: "player-2",
          status: WaiverStatus.FAILED,
          reason: "Player was claimed by another team",
          faabBid: 5,
        },
      ],
    });

    expect(sendEmailMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: "alex@example.com",
        subject: "Waiver claim successful in Basement Bowl",
        html: expect.stringContaining("Bad Quarterback"),
      }),
    );
    expect(sendEmailMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: "sam@example.com",
        subject: "Waiver claim failed in Basement Bowl",
        html: expect.stringContaining("Player was claimed by another team"),
      }),
    );
  });
});
