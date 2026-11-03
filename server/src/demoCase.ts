import { FICTION_DISCLOSURE } from "./shared/index.js";
import type { CaseDocument, CaseSecretDocument } from "./models.js";

const stamp = (hour: number, minute = 0): string =>
  `2026-10-18T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`;

const suspects: CaseDocument["suspects"] = [
  {
    suspectId: "sus_01",
    name: "Mara Vale",
    role: "House curator",
    relationshipToCase: "Responsible for the watch collection",
    visibleStatement:
      "I left the study before the storm began and stayed in the gallery.",
  },
  {
    suspectId: "sus_02",
    name: "Elias Reed",
    role: "Chef",
    relationshipToCase: "Prepared the reunion supper",
    visibleStatement:
      "I was in the kitchen from the first course until the alarm.",
  },
  {
    suspectId: "sus_03",
    name: "Nia Bell",
    role: "Collection assistant",
    relationshipToCase: "Had temporary access to the study key",
    visibleStatement:
      "I returned the key before dinner and never went back upstairs.",
  },
  {
    suspectId: "sus_04",
    name: "Rowan Pike",
    role: "Family guest",
    relationshipToCase: "A watch collector invited to the reunion",
    visibleStatement: "I remained in the music room after arriving at six.",
  },
];

const evidence: CaseDocument["evidence"] = [
  {
    evidenceId: "ev_01",
    type: "chat",
    title: "Reunion group chat",
    occurredAt: stamp(17, 40),
    description:
      "The guests coordinate their arrival before the watch disappears.",
    chat: {
      participants: ["Mara", "Elias", "Nia", "Rowan"],
      messages: [
        {
          messageId: "m1",
          senderName: "Elias",
          sentAt: stamp(17, 40),
          text: "Supper is on the table at seven.",
        },
        {
          messageId: "m2",
          senderName: "Nia",
          sentAt: stamp(17, 44),
          text: "I am taking the study key back to the hall desk.",
        },
        {
          messageId: "m3",
          senderName: "Rowan",
          sentAt: stamp(17, 51),
          text: "I will wait in the music room.",
        },
      ],
    },
  },
  {
    evidenceId: "ev_02",
    type: "chat",
    title: "Nia and Rowan's messages",
    occurredAt: stamp(18, 8),
    description:
      "A private exchange places Nia near the upstairs corridor after she says she left.",
    chat: {
      participants: ["Nia", "Rowan"],
      messages: [
        {
          messageId: "m4",
          senderName: "Rowan",
          sentAt: stamp(18, 8),
          text: "Did you leave the study window latched?",
        },
        {
          messageId: "m5",
          senderName: "Nia",
          sentAt: stamp(18, 9),
          text: "I am by the linen landing. I will check after the guests sit.",
        },
        {
          messageId: "m6",
          senderName: "Rowan",
          sentAt: stamp(18, 10),
          text: "I am still downstairs; please do not bring the watch out.",
        },
      ],
    },
  },
  {
    evidenceId: "ev_03",
    type: "photo",
    title: "Study display before supper",
    occurredAt: stamp(17, 55),
    description:
      "Demo illustration placeholder. The written inventory confirms the blue presentation case was on the study desk.",
  },
  {
    evidenceId: "ev_04",
    type: "cctv",
    title: "East stair camera — still, no video",
    occurredAt: stamp(18, 16),
    description:
      "A text-only demo record of the camera log; this is not a generated video or CCTV image.",
    cctv: {
      rendition: "still",
      transcript:
        "At 18:16, one person carrying a folded linen cloth enters the east stair landing; the face is not visible.",
    },
  },
  {
    evidenceId: "ev_05",
    type: "photo",
    title: "Linen landing inventory sketch",
    occurredAt: stamp(18, 23),
    description:
      "Demo illustration placeholder. A written service note records a fresh crease in the folded cloth.",
  },
  {
    evidenceId: "ev_06",
    type: "document",
    title: "Key desk register",
    occurredAt: stamp(18, 30),
    description: "A signed register tracks the temporary study key.",
    recordText:
      "17:32 — N. Bell checked out key K-4. 17:48 — return slot empty. 18:31 — key K-4 found in the linen cart pocket.",
  },
  {
    evidenceId: "ev_07",
    type: "witness",
    title: "Housekeeper's statement",
    occurredAt: stamp(18, 42),
    description: "The housekeeper describes what she directly observed.",
    recordText:
      "At 18:20 I saw Nia leaving the east stairs with a folded linen cloth. She said she had been checking the upstairs windows. I did not see anyone else on the stairs.",
  },
];

export const createDemoCase = (
  ownerSessionHash: string,
  caseId: string,
  now: Date,
): { mystery: CaseDocument; secret: CaseSecretDocument } => ({
  mystery: {
    caseId,
    ownerSessionHash,
    title: "The Pocket Watch at Briar House",
    intro:
      "During a stormy reunion, a rare pocket watch vanished from the locked study. Four guests had reasons to be near the house's upper floor. Use the records to work out who took it.",
    scenario:
      "During a rainstorm, a rare pocket watch disappears from a locked study while four guests are in the mansion.",
    difficulty: "medium",
    mediaTier: "standard",
    settingTimeZone: "America/New_York",
    suspects,
    evidence,
    fixture: true,
    status: "ready",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  },
  secret: {
    caseId,
    culpritId: "sus_03",
    hintTexts: [
      "Compare Nia's claim that she left the upper floor with the time-stamped messages.",
      "The key register and the east-stair record both narrow down who could return after dinner began.",
      "The exchange at 18:09 places Nia near the linen landing; the key was later found in the cart she was seen carrying.",
    ],
    proofChain: [
      {
        evidenceId: "ev_02",
        inference:
          "Nia's message places her at the linen landing after she claimed to have left the upstairs area.",
      },
      {
        evidenceId: "ev_04",
        inference:
          "The east-stair record shows someone carrying linen entered the landing shortly before the watch was reported missing.",
      },
      {
        evidenceId: "ev_06",
        inference:
          "The study key checked out by Nia was later found in the linen cart.",
      },
      {
        evidenceId: "ev_07",
        inference:
          "The housekeeper directly identifies Nia carrying the linen cloth from the stairs.",
      },
    ],
    redHerrings: [
      {
        evidenceId: "ev_01",
        explanation:
          "Rowan's interest in the watch sounds suspicious, but the timeline places him downstairs while the key and stair evidence point elsewhere.",
      },
      {
        evidenceId: "ev_03",
        explanation:
          "The display case being visible establishes the watch's location, not who took it.",
      },
    ],
    explanation:
      "Nia's statement conflicts with her own time-stamped message. The stair record and the housekeeper both place her carrying linen at the relevant time, and the missing study key was later found in that cart. The other suspects' motives are not supported by this access trail.",
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  },
});

export { FICTION_DISCLOSURE };
