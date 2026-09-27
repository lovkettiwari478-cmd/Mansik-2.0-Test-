export interface PersonalityProfile {
  tone: 'professional' | 'friendly' | 'concise' | 'detailed' | 'casual';
  responseLength: 'short' | 'medium' | 'long' | 'adaptive';
  focusMode: boolean;
  quietMode: boolean;
  urgentMode: boolean;
  communicationStyle?: string;
}

export class PersonalityEngine {
  static adaptResponse(response: string, profile: PersonalityProfile, context: { isUrgent?: boolean; isComplex?: boolean } = {}): string {
    let adapted = response;
    
    // Urgent mode
    if (profile.urgentMode || context.isUrgent) {
      // Make more direct and concise
      adapted = adapted.replace(/\n\n\*\[.*?\]\*/g, ''); // Remove provider notes in urgent mode
      if (adapted.length > 500) {
        adapted = adapted.slice(0, 500) + '... [Urgent mode: truncated]';
      }
      adapted = `⚡ URGENT: ${adapted}`;
    }
    
    // Quiet mode
    if (profile.quietMode) {
      adapted = adapted.slice(0, 300) + (adapted.length > 300 ? '...' : '');
    }
    
    // Focus mode
    if (profile.focusMode) {
      // Remove extra explanations, keep only essential
      adapted = adapted.split('\n').filter(line => !line.startsWith('*') && !line.startsWith('Note:')).join('\n');
    }
    
    // Tone adaptation
    switch (profile.tone) {
      case 'professional':
        adapted = adapted.replace(/Hey!/g, 'Hello').replace(/gonna/g, 'going to');
        break;
      case 'concise':
        // Remove filler
        adapted = adapted.replace(/As your Personal AI OS, /g, '').replace(/I can help you with/g, 'Options:');
        if (adapted.length > 400) {
          adapted = adapted.slice(0, 400) + '...';
        }
        break;
      case 'detailed':
        // Already detailed by default
        break;
      case 'casual':
        adapted = adapted.replace(/Hello/g, 'Hey').replace(/assist/g, 'help');
        break;
    }
    
    // Response length
    switch (profile.responseLength) {
      case 'short':
        if (adapted.length > 300) {
          adapted = adapted.slice(0, 300) + '...';
        }
        break;
      case 'long':
        // Keep full
        break;
      case 'adaptive':
        if (context.isComplex && adapted.length < 800) {
          adapted += '\n\nWould you like me to elaborate on any part?';
        }
        break;
    }
    
    return adapted;
  }
  
  static getGreeting(profile: PersonalityProfile, userName?: string, timeOfDay?: 'morning' | 'afternoon' | 'evening'): string {
    const namePart = userName ? `, ${userName}` : '';
    const greetings = {
      morning: `Good morning${namePart}! Ready to make today productive?`,
      afternoon: `Good afternoon${namePart}! How can I assist?`,
      evening: `Good evening${namePart}! Wrapping up the day?`
    };
    
    const tod = timeOfDay || this.getTimeOfDay();
    let greeting = greetings[tod];
    
    if (profile.tone === 'professional') {
      greeting = `Good ${tod}${namePart}. How may I assist you today?`;
    } else if (profile.tone === 'casual') {
      greeting = `Hey${namePart}! What's up?`;
    } else if (profile.quietMode) {
      greeting = `Hi${namePart}`;
    }
    
    return greeting;
  }
  
  private static getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }
  
  static detectUrgency(input: string): boolean {
    const urgentKeywords = ['urgent', 'asap', 'emergency', 'immediately', 'critical', 'deadline', 'overdue'];
    const lower = input.toLowerCase();
    return urgentKeywords.some(k => lower.includes(k)) || input.includes('!!!');
  }
}
