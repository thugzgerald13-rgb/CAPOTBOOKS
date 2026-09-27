import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Team, TeamMember, TeamInvitation } from '@/types/team';

interface TeamContextType {
  teams: Team[];
  activeTeam: Team | null;
  members: TeamMember[];
  invitations: TeamInvitation[];
  loading: boolean;
  setActiveTeam: (team: Team) => void;
  createTeam: (name: string) => Promise<Team | null>;
  sendInvitation: (email: string, role: string, permissions?: Record<string, unknown>) => Promise<boolean>;
  acceptInvitation: (token: string) => Promise<boolean>;
  revokeAccess: (userId: string) => Promise<boolean>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Load ALL teams the current user has access to — not just "owned" ones
  useEffect(() => {
    async function loadUserTeams() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get teams where user is a member — independent of ownership
      const { data: memberships } = await supabase
        .from('team_members')
        .select('*, teams(*)')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (memberships) {
        const userTeams = memberships.map(m => m.teams as Team);
        setTeams(userTeams);
        if (userTeams.length > 0) setActiveTeam(userTeams[0]);
      }
      setLoading(false);
    }

    loadUserTeams();
  }, []);

  // Send invite — creates pending invitation, NEVER creates dependent accounts
  async function sendInvitation(email: string, role: string, permissions = {}) {
    if (!activeTeam) return false;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const token = crypto.randomUUID();

    const { error } = await supabase
      .from('team_invitations')
      .insert({
        team_id: activeTeam.id,
        inviter_id: user.id,
        invitee_email: email,
        role,
        permissions,
        invitation_token: token
      });

    return !error;
  }

  // Accept invite — links EXISTING/NEW independent account to the team
  async function acceptInvitation(token: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Find valid invitation
    const { data: invite } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .single();

    if (!invite) return false;

    // Create independent membership — user owns their own entry
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: invite.team_id,
        user_id: user.id,
        role: invite.role,
        permissions: invite.permissions,
        invited_by: invite.inviter_id
      });

    if (memberError) return false;

    // Mark invitation accepted
    await supabase
      .from('team_invitations')
      .update({
        status: 'accepted',
        accepted_by_user_id: user.id,
        accepted_at: new Date().toISOString()
      })
      .eq('id', invite.id);

    return true;
  }

  async function revokeAccess(userId: string) {
    if (!activeTeam) return false;
    const { error } = await supabase
      .from('team_members')
      .update({ is_active: false })
      .eq('team_id', activeTeam.id)
      .eq('user_id', userId);
    return !error;
  }

  async function createTeam(name: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: team } = await supabase
      .from('teams')
      .insert({ name, created_by: user.id })
      .select()
      .single();

    // Creator becomes owner member
    if (team) {
      await supabase.from('team_members').insert({
        team_id: team.id,
        user_id: user.id,
        role: 'owner',
        invited_by: user.id
      });
      setTeams(prev => [...prev, team]);
      setActiveTeam(team);
    }
    return team;
  }

  return (
    <TeamContext.Provider value={{
      teams, activeTeam, members, invitations, loading,
      setActiveTeam, createTeam, sendInvitation, acceptInvitation, revokeAccess
    }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
}
