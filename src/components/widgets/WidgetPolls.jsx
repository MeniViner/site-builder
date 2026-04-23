// src/components/widgets/WidgetPolls.jsx
import React, { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Vote } from 'lucide-react';
import WidgetEmptyState from './WidgetEmptyState';
import { useWidget } from '../../context/WidgetContext';
import { useAuth } from '../../context/AuthContext';

const normalizeIdentityText = (value) => String(value ?? '').trim().toLowerCase();
const normalizePersonalNumber = (value) => String(value ?? '').replace(/\D/g, '');
const ANONYMOUS_IDENTITY_STORAGE_KEY = 'widget_polls_anonymous_identity';

function getAnonymousIdentity() {
  if (typeof window === 'undefined') return null;

  const existing = window.sessionStorage.getItem(ANONYMOUS_IDENTITY_STORAGE_KEY);
  if (existing) {
    return {
      key: `anon:${existing}`,
      personalNumber: '',
      email: '',
      loginName: '',
      displayName: '',
    };
  }

  const generated = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.sessionStorage.setItem(ANONYMOUS_IDENTITY_STORAGE_KEY, generated);
  return {
    key: `anon:${generated}`,
    personalNumber: '',
    email: '',
    loginName: '',
    displayName: '',
  };
}

function resolveUserIdentity(currentUser) {
  const personalNumber = normalizePersonalNumber(currentUser?.personalNumber);
  if (personalNumber) {
    return {
      key: `pn:${personalNumber}`,
      personalNumber,
      email: '',
      loginName: '',
      displayName: normalizeIdentityText(currentUser?.displayName),
    };
  }

  const email = normalizeIdentityText(currentUser?.email);
  if (email) {
    return {
      key: `email:${email}`,
      personalNumber: '',
      email,
      loginName: '',
      displayName: normalizeIdentityText(currentUser?.displayName),
    };
  }

  const loginName = normalizeIdentityText(currentUser?.loginName);
  if (loginName) {
    return {
      key: `login:${loginName}`,
      personalNumber: '',
      email: '',
      loginName,
      displayName: normalizeIdentityText(currentUser?.displayName),
    };
  }

  const displayName = normalizeIdentityText(currentUser?.displayName);
  if (displayName) {
    return {
      key: `name:${displayName}`,
      personalNumber: '',
      email: '',
      loginName: '',
      displayName,
    };
  }

  return getAnonymousIdentity();
}

function isSameVoter(voter, identity) {
  if (!identity) return false;

  if (typeof voter === 'string') {
    return normalizeIdentityText(voter) === identity.displayName;
  }

  const voterId = normalizeIdentityText(voter?.id);
  const voterName = normalizeIdentityText(voter?.name ?? voter?.displayName);
  const voterEmail = normalizeIdentityText(voter?.email);
  const voterLoginName = normalizeIdentityText(voter?.loginName);
  const voterPersonalNumber = normalizePersonalNumber(voter?.personalNumber);

  if (voterId && voterId === identity.key) return true;
  if (identity.displayName && voterName === identity.displayName) return true;
  if (identity.email && voterEmail === identity.email) return true;
  if (identity.loginName && voterLoginName === identity.loginName) return true;
  if (identity.personalNumber && voterPersonalNumber === identity.personalNumber) return true;

  return false;
}

export default function WidgetPolls({ data = [] }) {
  const { widgetConfig, savePollVote } = useWidget();
  const { currentUser } = useAuth();
  const [localVote, setLocalVote] = useState({ pollId: null, optionId: null });
  const [isSavingVote, setIsSavingVote] = useState(false);

  const activePoll = useMemo(() => data.find((item) => item.active === true), [data]);
  const options = activePoll?.options || [];
  const identity = useMemo(() => resolveUserIdentity(currentUser), [currentUser]);

  if (!activePoll) {
    return <WidgetEmptyState icon={Vote} title="אין סקר פעיל כרגע" description="כאשר יופעל סקר יחידתי חדש, הוא יוצג כאן להצבעה מהירה." />;
  }

  const persistedOptionId = identity
    ? (options.find((option) => Array.isArray(option?.voters) && option.voters.some((voter) => isSameVoter(voter, identity)))?.id ?? null)
    : null;
  const selectedOptionId = localVote.pollId === activePoll.id ? localVote.optionId : null;
  const resolvedSelectedOptionId = selectedOptionId || persistedOptionId;
  const hasVoted = Boolean(resolvedSelectedOptionId);
  const totalVotes = options.reduce((sum, option) => sum + (option.votes || 0), 0) || 1;
  const visibleItems = options;

  const handleVote = async (optionId) => {
    if (!activePoll || isSavingVote) return;
    setLocalVote({ pollId: activePoll.id, optionId });

    if (!identity || !widgetConfig) {
      return;
    }

    const resolvedUserName = String(
      currentUser?.displayName
      || currentUser?.email
      || currentUser?.loginName
      || currentUser?.personalNumber
      || 'משתמש'
    ).trim();

    const sourcePolls = Array.isArray(widgetConfig?.polls) ? widgetConfig.polls : data;
    const voterPayload = {
      id: identity.key,
      name: resolvedUserName,
      displayName: resolvedUserName,
      email: String(currentUser?.email ?? '').trim(),
      loginName: String(currentUser?.loginName ?? '').trim(),
      personalNumber: normalizePersonalNumber(currentUser?.personalNumber),
      votedAt: new Date().toISOString(),
    };

    const nextPolls = sourcePolls.map((poll) => {
      if (String(poll?.id) !== String(activePoll.id)) return poll;

      const optionList = Array.isArray(poll?.options) ? poll.options : [];
      return {
        ...poll,
        options: optionList.map((option) => {
          const existingVoters = Array.isArray(option?.voters) ? option.voters : [];
          const cleanedVoters = existingVoters.filter((voter) => !isSameVoter(voter, identity));
          const isTargetOption = String(option?.id) === String(optionId);
          const hadVoteOnOption = existingVoters.length !== cleanedVoters.length;
          const currentVotes = Math.max(0, Number(option?.votes) || 0);
          const votesAfterRemoval = hadVoteOnOption ? Math.max(0, currentVotes - 1) : currentVotes;

          if (isTargetOption) {
            return {
              ...option,
              votes: hadVoteOnOption ? currentVotes : currentVotes + 1,
              voters: [...cleanedVoters, voterPayload],
            };
          }

          if (!hadVoteOnOption) {
            return option;
          }

          return {
            ...option,
            votes: votesAfterRemoval,
            voters: cleanedVoters,
          };
        }),
      };
    });

    setIsSavingVote(true);
    const success = await savePollVote(nextPolls);
    setIsSavingVote(false);

    if (!success) {
      setLocalVote({ pollId: null, optionId: null });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="bg-themeBg-card text-themeText-primary border-themeBorder rounded-[24px] border border-gray-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#232733]">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            {hasVoted ? <BarChart3 size={22} /> : <Vote size={22} />}
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-primary/80">
              {hasVoted ? 'תוצאות הסקר' : 'סקר יחידתי'}
            </div>
            <h3 className="mt-2 text-lg font-black leading-7 text-themeText-primary text-gray-900 dark:text-white">
              {activePoll.question}
            </h3>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="space-y-3">
          {!hasVoted ? (
            visibleItems.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleVote(option.id)}
                disabled={isSavingVote}
                className={`bg-themeBg-card hover:bg-themeBg-elevated text-themeText-primary border-themeBorder w-full rounded-[20px] border border-gray-200 bg-white px-4 py-4 text-right transition hover:bg-gray-50 hover:border-primary/20 dark:border-white/10 dark:bg-[#232733] dark:hover:bg-[#2a2e38] ${isSavingVote ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-themeText-primary text-gray-900 dark:text-white">
                    {option.text}
                  </span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    {isSavingVote ? 'שומר...' : 'הצבע'}
                  </span>
                </div>
              </button>
            ))
          ) : (
            visibleItems.map((option) => {
              const percentage = Math.round(((option.votes || 0) / totalVotes) * 100);
              const isSelected = resolvedSelectedOptionId === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleVote(option.id)}
                  disabled={isSavingVote}
                  className={`bg-themeBg-card border-themeBorder w-full rounded-[20px] border border-gray-200 bg-white p-4 text-right transition hover:border-primary/30 hover:bg-gray-50 dark:border-white/10 dark:bg-[#232733] dark:hover:bg-[#2a2e38] ${isSavingVote ? 'cursor-not-allowed opacity-80' : ''}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {isSelected && <CheckCircle2 size={16} className="text-primary" />}
                      <span className="text-sm font-bold text-themeText-primary text-gray-900 dark:text-white">
                        {option.text}
                      </span>
                    </div>
                    <span className="text-xs font-black text-primary">{percentage}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-primary/10">
                    <div
                      className="h-full rounded-full bg-primary/20"
                      style={{ width: `${Math.max(percentage, 8)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-gray-500 dark:text-gray-300">
                    {isSelected ? 'ההצבעה שלך כרגע' : (isSavingVote ? 'שומר...' : 'לחץ כדי לשנות הצבעה')}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
