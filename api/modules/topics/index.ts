import { createMessage } from '../../utils/messageHelper';
import { broadcastToRoom, pushMessage } from '../../utils/socket';
import { TopicController } from './topics.controller';
import { currentTopicPolicy } from './topics.policy';
import { createLegacyTopicsRouter, createV1TopicsRouter } from './topics.routes';
import { TopicService } from './topics.service';
import { SqliteTopicRepository } from './topics.sqlite-repository';
import { resolveCreatorTopicSuggestionAttribution } from '../../services/creatorTopicSuggestionAttribution';

export const topicRepository = new SqliteTopicRepository();
export const topicService = new TopicService({
  repository: topicRepository,
  policy: currentTopicPolicy,
  resolveCreatorTopicSuggestionSource: resolveCreatorTopicSuggestionAttribution,
  notify(message) {
    createMessage(message.userId, message.title, message.content, message.type, message.link);
  },
  pushNotification(message) {
    pushMessage(message.userId, message);
  },
  broadcast: broadcastToRoom,
});
export const topicController = new TopicController(topicService);
export const legacyTopicsRouter = createLegacyTopicsRouter(topicController);
export const v1TopicsRouter = createV1TopicsRouter(topicController);

export * from './topics.controller';
export * from './topics.policy';
export * from './topics.repository';
export * from './topics.service';
export * from './topics.sqlite-repository';
export * from './topics.types';
