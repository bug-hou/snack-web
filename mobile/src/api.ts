import { invoke } from './client';

/** 与云函数 viewProduct 对齐 */
export type Product = {
  id: string;
  name: string;
  spec: string;
  category: string;
  priceCents: number;
  price: string;
  label: string;
  initials: string;
  tone: string;
  image: string;
  featured: boolean;
};

/** 与云函数 publicSettings + getContext 对齐（只列骨架用到的字段） */
export type ShopContext = {
  isOwner: boolean;
  ordersEnabled: boolean;
  ownOpenid: string;
  isOpen: boolean;
  businessStart: string;
  businessEnd: string;
};

export type ForumPost = {
  id: string;
  board: string;
  title: string;
  content: string;
  author: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  isMine: boolean;
  createdAt: number;
};

export const getCatalog = () => invoke<Product[]>('snackShop', 'getCatalog');

export const getContext = () => invoke<ShopContext>('snackShop', 'getContext');

export const listPosts = (board = '') => invoke<ForumPost[]>('snackShop', 'listPosts', { board, page: 0 });
