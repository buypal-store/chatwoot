class AddLastMessageAtToConversations < ActiveRecord::Migration[7.2]
  disable_ddl_transaction!

  def change
    add_column :conversations, :last_message_at, :datetime

    add_index :conversations,
              [:account_id, :last_message_at],
              order: { last_message_at: 'DESC NULLS LAST' },
              name: 'index_conversations_on_account_and_last_message',
              algorithm: :concurrently
  end
end
