import api from './api';

export interface Checkpoint {
  id: number;
  name: string;
  location: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateCheckpointPayload {
  name: string;
  location: string;
}

export interface UpdateCheckpointPayload {
  name?: string;
  location?: string;
  isActive?: boolean;
}

export const checkpointService = {
  /**
   * Get all active checkpoints (available to all authenticated users)
   */
  async getActive(): Promise<Checkpoint[]> {
    const res = await api.get('/checkpoints');
    return res.data?.checkpoints || [];
  },

  /**
   * Get all checkpoints including inactive (admin only)
   */
  async getAll(): Promise<Checkpoint[]> {
    const res = await api.get('/checkpoints/all');
    return res.data?.checkpoints || [];
  },

  /**
   * Create a new checkpoint (admin only)
   */
  async create(payload: CreateCheckpointPayload): Promise<Checkpoint> {
    const res = await api.post('/checkpoints', payload);
    return res.data?.checkpoint;
  },

  /**
   * Update an existing checkpoint (admin only)
   */
  async update(id: number, payload: UpdateCheckpointPayload): Promise<Checkpoint> {
    const res = await api.patch(`/checkpoints/${id}`, payload);
    return res.data?.checkpoint;
  },

  /**
   * Soft-delete (deactivate) a checkpoint (admin only)
   */
  async deactivate(id: number): Promise<void> {
    await api.delete(`/checkpoints/${id}`);
  },
};
