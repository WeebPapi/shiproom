import { extractionResultSchema, transcriptSchema } from "./contracts";

export const DEMO_NOTE = "Scripted demo: synthetic Georgian transcript and fixed tasks. Spoken audio was not transcribed or analyzed. Linear issues are real.";

export const DEMO_SEGMENTS = [
  { id: "seg-0001", startMs: 0, endMs: 6000, speakerUserId: null, speakerLabel: "ალექსანდრე", text: "Shiproom-ის რეპოზიტორიის არჩევა გავაუმჯობესოთ. სანამ სია იტვირთება, ჩატვირთვის ინდიკატორი ვაჩვენოთ." },
  { id: "seg-0002", startMs: 6000, endMs: 13000, speakerUserId: null, speakerLabel: "ნიკა", text: "შევთანხმდით. ჩატვირთვისას არჩევა გამორთული იყოს, სიის მიღების შემდეგ კი ჩაირთოს." },
  { id: "seg-0003", startMs: 13000, endMs: 21000, speakerUserId: null, speakerLabel: "ალექსანდრე", text: "თუ რეპოზიტორიები არ არის, ცარიელი მდგომარეობა ვაჩვენოთ და დავწეროთ, რომ მფლობელმა Connections გვერდიდან დაამატოს რეპოზიტორია." },
  { id: "seg-0004", startMs: 21000, endMs: 30000, speakerUserId: null, speakerLabel: "ნიკა", text: "დიახ, ორივე დავალება Shiproom-ის პროექტში შევქმნათ. ძებნა ახლა არ დავამატოთ, მოგვიანებით განვიხილოთ." },
];

export const DEMO_EXTRACTION = extractionResultSchema.parse({
  summary: "შევთანხმდით რეპოზიტორიის არჩევის ჩატვირთვისა და ცარიელი მდგომარეობების დამატებაზე. ძებნა გადაიდო.",
  decisions: ["დავამატოთ ჩატვირთვის ინდიკატორი და ცარიელი მდგომარეობა.", "ძებნა ამ ეტაპზე არ დაემატება."],
  openQuestions: [],
  tasks: [
    {
      title: "Add repository picker loading state",
      description: "Show a loading indicator while the repository list loads. Disable selection until the list is ready.",
      acceptanceCriteria: ["A loading indicator is visible while repositories load.", "Selection is disabled during loading and enabled when the list arrives."],
      evidenceSegmentIds: ["seg-0001", "seg-0002", "seg-0004"],
    },
    {
      title: "Add repository picker empty state",
      description: "When no repositories are available, show an empty state explaining that a team owner can add a repository from Connections.",
      acceptanceCriteria: ["An empty repository list shows an empty state.", "The message directs the team owner to add a repository from Connections."],
      evidenceSegmentIds: ["seg-0003", "seg-0004"],
    },
  ],
});

export function demoTranscript(meetingId: string) {
  return transcriptSchema.parse({ meetingId, revision: 1, source: "demo", complete: true, language: "ka", segments: DEMO_SEGMENTS });
}
