/**
 * Deterministic Ask benchmark questions. Jira ground truth is supplied separately.
 */

export type SingleQuestion = {
  test_id: string;
  category: string;
  question: string;
};

export const SINGLE_QUESTIONS: SingleQuestion[] = [
  { test_id: "Q01", category: "basic_retrieval", question: "What is the RD project about?" },
  { test_id: "Q02", category: "basic_retrieval", question: "How many issues are there in the RD project?" },
  { test_id: "Q03", category: "basic_retrieval", question: "List the latest 10 issues created in RD." },
  { test_id: "Q04", category: "basic_retrieval", question: "Show me all open issues in RD." },
  { test_id: "Q05", category: "basic_retrieval", question: "Show me all closed issues in RD." },
  { test_id: "Q06", category: "basic_retrieval", question: "What are the different issue types in RD?" },
  { test_id: "Q07", category: "basic_retrieval", question: "List all RD issues assigned to Mohd Kabir." },
  { test_id: "Q08", category: "basic_retrieval", question: "What issues are currently unassigned in RD?" },
  { test_id: "Q09", category: "basic_retrieval", question: "List all highest-priority issues in RD." },
  { test_id: "Q10", category: "basic_retrieval", question: "Which RD issues are currently in progress?" },

  { test_id: "Q11", category: "specific_ticket_lookup", question: "What is the status of RD-3?" },
  { test_id: "Q12", category: "specific_ticket_lookup", question: "Who is assigned to RD-3?" },
  { test_id: "Q13", category: "specific_ticket_lookup", question: "What is the priority of RD-3?" },
  { test_id: "Q14", category: "specific_ticket_lookup", question: "When was RD-3 created?" },
  { test_id: "Q15", category: "specific_ticket_lookup", question: "What is the description of RD-3?" },
  { test_id: "Q16", category: "specific_ticket_lookup", question: "Summarize RD-3 in simple terms." },
  { test_id: "Q17", category: "specific_ticket_lookup", question: "What comments have been added to RD-3?" },
  { test_id: "Q18", category: "specific_ticket_lookup", question: "What is the latest update on RD-3?" },
  { test_id: "Q19", category: "specific_ticket_lookup", question: "Who last updated RD-3?" },
  { test_id: "Q20", category: "specific_ticket_lookup", question: "Does RD-3 have any linked issues?" },

  { test_id: "Q21", category: "aggregation_breakdown", question: "How many RD issues are assigned to each person?" },
  { test_id: "Q22", category: "aggregation_breakdown", question: "How many issues are in each status?" },
  { test_id: "Q23", category: "aggregation_breakdown", question: "How many issues are there for each priority?" },
  { test_id: "Q24", category: "aggregation_breakdown", question: "How many bugs are currently open in RD?" },
  { test_id: "Q25", category: "aggregation_breakdown", question: "How many stories are currently in progress?" },
  { test_id: "Q26", category: "aggregation_breakdown", question: "Which person has the most open issues in RD?" },
  { test_id: "Q27", category: "aggregation_breakdown", question: "Which person has the most highest-priority issues?" },
  { test_id: "Q28", category: "aggregation_breakdown", question: "How many issues were created in RD this month?" },
  { test_id: "Q29", category: "aggregation_breakdown", question: "How many issues were resolved in RD this month?" },
  { test_id: "Q30", category: "aggregation_breakdown", question: "Show the number of issues created per month for RD." },

  { test_id: "Q31", category: "advanced_filtering", question: "Which RD issues appear to be overdue?" },
  { test_id: "Q32", category: "advanced_filtering", question: "Which highest-priority issues are still unresolved?" },
  { test_id: "Q33", category: "advanced_filtering", question: "Which assignees have the highest number of unresolved issues?" },
  { test_id: "Q34", category: "advanced_filtering", question: "Which issues have been open for the longest time?" },
  { test_id: "Q35", category: "advanced_filtering", question: "Find issues that have been in progress for more than 30 days." },
  { test_id: "Q36", category: "advanced_filtering", question: "Which issues have no assignee and are still unresolved?" },
  { test_id: "Q37", category: "advanced_filtering", question: "Which bugs are currently unresolved and highest priority?" },
  { test_id: "Q38", category: "advanced_filtering", question: "Are there any issues that have been reopened?" },
  { test_id: "Q39", category: "advanced_filtering", question: "Which issues have had their status changed recently?" },
  { test_id: "Q40", category: "advanced_filtering", question: "Which issues haven't been updated for a long time?" },

  { test_id: "Q41", category: "cross_ticket_search", question: "Find all issues related to RD-3." },
  { test_id: "Q42", category: "cross_ticket_search", question: "Which issues are blocked by other RD issues?" },
  { test_id: "Q43", category: "cross_ticket_search", question: "Find issues that have similar descriptions to RD-3." },
  { test_id: "Q44", category: "cross_ticket_search", question: "Are there multiple issues reporting the same problem?" },
  { test_id: "Q45", category: "cross_ticket_search", question: "Find duplicate or potentially duplicate RD issues." },

  { test_id: "Q46", category: "high_level_nl", question: "What work is the RD team currently doing?" },
  { test_id: "Q47", category: "high_level_nl", question: "What are the biggest outstanding problems in RD?" },
  { test_id: "Q48", category: "high_level_nl", question: "Give me a summary of the current RD project health." },
  { test_id: "Q49", category: "high_level_nl", question: "What are the biggest risks in RD based on the Jira tickets?" },
  { test_id: "Q50", category: "high_level_nl", question: "Tell me something about RD that is not present in the Jira data." },
];

export const HALLUCINATION_TESTS: SingleQuestion[] = [
  { test_id: "H1", category: "hallucination", question: "What is RD-999999 about?" },
  { test_id: "H2", category: "hallucination", question: "Who is assigned to RD-999999?" },
  { test_id: "H3", category: "hallucination", question: "Is there an issue called RD-DOES-NOT-EXIST?" },
  { test_id: "H4", category: "hallucination", question: "What was discussed in the RD team's meeting yesterday?" },
  { test_id: "H5", category: "hallucination", question: "What is the production deployment date for RD?" },
];

export type ConversationSpec = {
  conversation_id: string;
  turns: Array<{ test_id: string; question: string }>;
};

export const CONVERSATIONS: ConversationSpec[] = [
  {
    conversation_id: "A",
    turns: [
      { test_id: "A1", question: "Show me all unresolved highest-priority issues in RD." },
      { test_id: "A2", question: "Which of those are assigned to the same person?" },
      { test_id: "A3", question: "Summarize the oldest one." },
    ],
  },
  {
    conversation_id: "B",
    turns: [
      { test_id: "B1", question: "Show me all high-priority unresolved issues in RD." },
      { test_id: "B2", question: "Which of those have no assignee?" },
      { test_id: "B3", question: "Tell me more about the first one." },
    ],
  },
  {
    conversation_id: "C",
    turns: [
      { test_id: "C1", question: "What is RD-3 about?" },
      { test_id: "C2", question: "Who is its parent?" },
      { test_id: "C3", question: "What other issues are related to it?" },
    ],
  },
];
