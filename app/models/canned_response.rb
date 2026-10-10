# == Schema Information
#
# Table name: canned_responses
#
#  id         :integer          not null, primary key
#  content    :text
#  short_code :string
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  account_id :integer          not null
#

class CannedResponse < ApplicationRecord
  include AccountCacheRevalidator

  # BuyPal: imagen opcional; al usar la respuesta, sale junto al texto en un solo mensaje (pie de foto).
  IMAGE_TYPES = %w[image/jpeg image/png image/webp].freeze
  IMAGE_MAX_SIZE = 5.megabytes

  validates :content, presence: true
  validates :short_code, presence: true
  validates :account, presence: true
  validates :short_code, uniqueness: { scope: :account_id }
  validate :image_type_and_size

  belongs_to :account
  has_one_attached :image

  scope :order_by_search, lambda { |search|
    short_code_starts_with = sanitize_sql_array(['WHEN short_code ILIKE ? THEN 1', "#{search}%"])
    short_code_like = sanitize_sql_array(['WHEN short_code ILIKE ? THEN 0.5', "%#{search}%"])
    content_like = sanitize_sql_array(['WHEN content ILIKE ? THEN 0.2', "%#{search}%"])

    order_clause = "CASE #{short_code_starts_with} #{short_code_like} #{content_like} ELSE 0 END"

    order(Arel.sql(order_clause) => :desc)
  }

  def as_json(options = {})
    super.merge('image' => image_data)
  end

  def image_data
    return unless image.attached?

    blob = image.blob
    {
      signed_id: blob.signed_id,
      filename: blob.filename.to_s,
      content_type: blob.content_type,
      byte_size: blob.byte_size,
      url: Rails.application.routes.url_helpers.rails_blob_path(blob, only_path: true)
    }
  end

  private

  def image_type_and_size
    return unless image.attached?

    errors.add(:image, 'debe ser JPG, PNG o WEBP') unless IMAGE_TYPES.include?(image.blob.content_type)
    errors.add(:image, 'debe pesar menos de 5 MB') if image.blob.byte_size > IMAGE_MAX_SIZE
  end
end
