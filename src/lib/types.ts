export interface JobData {
  title: string;
  company: string;
  location?: string;
  description: string;
  url: string;
  site: "Welcome to the Jungle";
  parsedVia: "structured" | "fallback";
}

export interface MasterProfile {
  contact: {
    name: string;
    email: string;
    phone?: string;
    location?: string;
    linkedinUrl?: string;
    portfolioUrl?: string;
  };
  summary: string;
  experience: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    bullets: string[];
  }>;
  education: Array<{
    school: string;
    degree: string;
    field: string;
    gradDate: string;
  }>;
  skills: string[];
}

export interface TailoredOutput {
  resume: {
    summary: string;
    experience: Array<{ company: string; title: string; dates: string; bullets: string[] }>;
    skills: string[];
  };
  coverLetter: string;
}

export interface ApplicationRecord {
  id: string;
  dateApplied: string;
  company: string;
  jobTitle: string;
  site: "Welcome to the Jungle" | "LinkedIn" | "Wellfound";
  jobUrl: string;
  status: "applied" | "interviewing" | "rejected" | "offer";
  resumeFileName?: string;
}
