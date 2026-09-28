export interface Talk {
  id: number;
  title: string;
  teacher: string;
  teacherId?: number;
  durationMinutes: number;
  date: string;
  audioUrl: string;
  retreatId?: number;
  retreatTitle?: string;
}

export interface TalkDetail extends Talk {
  description: string;
  retreatTitle?: string;
}

export interface SearchResponse {
  talks: Talk[];
  page: number;
  hasMore: boolean;
}

export interface Teacher {
  id: number;
  name: string;
}

export interface TeacherSearchResponse {
  teachers: Teacher[];
}

export interface TeacherMatch extends Teacher {
  /** The query with the teacher's name removed, e.g. "metta" for "goldstein metta" */
  rest: string;
}

export interface TeacherMatchResponse {
  matches: TeacherMatch[];
}

export interface Retreat {
  id: number;
  name: string;
  date: string;
}

export interface TeacherRetreatsResponse {
  retreats: Retreat[];
}
