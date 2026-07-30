import {
  canEditTopic as legacyCanEditTopic,
  canViewAllContent as legacyCanViewAllContent,
  canViewTopic as legacyCanViewTopic,
} from '../../utils/access';
import type { TopicActor, TopicRecord } from './topics.types';

export interface TopicPolicy {
  canViewAll(actor: TopicActor): boolean;
  canViewTopic(actor: TopicActor, topic: TopicRecord): boolean;
  canEditTopic(actor: TopicActor, topic: TopicRecord): boolean;
}

export function canViewTopic(actor: TopicActor, topic: TopicRecord) {
  return legacyCanViewTopic(actor as never, topic);
}

export function canEditTopic(actor: TopicActor, topic: TopicRecord) {
  return legacyCanEditTopic(actor as never, topic);
}

export const currentTopicPolicy: TopicPolicy = {
  canViewAll(actor) {
    return legacyCanViewAllContent(actor as never);
  },
  canViewTopic(actor, topic) {
    return canViewTopic(actor, topic);
  },
  canEditTopic(actor, topic) {
    return canEditTopic(actor, topic);
  },
};
