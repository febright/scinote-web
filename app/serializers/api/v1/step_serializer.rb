# frozen_string_literal: true

module Api
  module V1
    class StepSerializer < ActiveModel::Serializer
      include ApplicationHelper
      include ActionView::Helpers::TextHelper
      include InputSanitizeHelper

      type :steps
      attributes :id, :name, :description, :position, :completed
      attribute :completed_on, if: -> { object.completed? }
      belongs_to :protocol, serializer: ProtocolSerializer
      has_many :assets, serializer: AssetSerializer
      has_many :checklists, serializer: ChecklistSerializer
      has_many :tables, serializer: TableSerializer
      has_many :step_comments, key: :comments, serializer: CommentSerializer

      def description
        if instance_options[:rte_rendering]
          custom_auto_link(object.tinymce_render(:description), simple_format: false, tags: %w(img))
        else
          object.description
        end
      end
    end
  end
end
