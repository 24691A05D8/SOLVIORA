/**
 * @file /src/types.ts
 * @description Type definitions and structural blueprints for the Smart AI Calculator.
 * 
 * --- EDUCATIONAL LESSON FOR BEGINNERS: WHAT ARE TYPES? ---
 * In a TypeScript app, we declare 'Types' or 'Interfaces' to outline the shapes
 * of data our program uses. This is like creating a contract or blueprint. If any
 * part of our code tries to use an object that doesn't fit this blueprint, 
 * TypeScript will point it out immediately before we even run the app! 
 * This prevents bugs early and acts as live documentation.
 */

// Define what kind of calculation is stored in the database or state.
export interface CalculationItem {
  id: string;             // A unique identifier for this specific calculation (e.g., using Date.now() or crypto.randomUUID())
  type: 'standard' | 'ai'; // Districts standard arithmetic calculations from AI natural language requests
  input: string;          // What the user clicked/typed (e.g., "5 + 5" or "What is half of 150?")
  result: string;         // The final numeric result or AI processed answer
  explanation?: string;   // Optional detailed explanation provided by the AI tutor
  steps?: string[];       // Optional list of sequenced actions leading to the result
  timestamp: number;      // Epoch millisecond timestamp representing when it was calculated
}

// Represent the states of the background processing steps for visual feedback.
export type StepStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface DiagnosticsStep {
  id: number;            // Order of the step (1-6)
  label: string;         // High-level title of what is happening (e.g., "AI Processing")
  description: string;   // Beginner-friendly description of what's happening under the hood
  status: StepStatus;    // The current state of this processing step
}

export interface ApiResponse {
  success: boolean;
  result: string;
  explanation: string;
  steps: string[];
  error?: string;
}
