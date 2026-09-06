#!/usr/bin/env ruby
# frozen_string_literal: true

# Configure Capacitor ios/App Xcode project for CI signing.
# Usage: ruby scripts/ios-configure-xcode.rb <App.xcodeproj> <bundleId> <teamId>
# Optional env:
#   CODE_SIGN_STYLE (Automatic|Manual)
#   CODE_SIGN_IDENTITY
#   PROVISIONING_PROFILE_SPECIFIER
#   MARKETING_VERSION / CURRENT_PROJECT_VERSION / GITHUB_RUN_NUMBER

require "xcodeproj"

proj_path = ARGV[0] or abort("usage: ios-configure-xcode.rb <App.xcodeproj> <bundleId> <teamId>")
bundle_id = ARGV[1] or abort("bundleId required")
team_id = ARGV[2] or abort("teamId required")

abort("missing project: #{proj_path}") unless File.directory?(proj_path)

sign_style = ENV.fetch("CODE_SIGN_STYLE", "Automatic")
sign_identity = ENV["CODE_SIGN_IDENTITY"]
profile_spec = ENV["PROVISIONING_PROFILE_SPECIFIER"]

project = Xcodeproj::Project.open(proj_path)

project.targets.each do |target|
  next unless target.respond_to?(:build_configurations)

  is_app =
    target.respond_to?(:product_type) &&
    target.product_type.to_s == "com.apple.product-type.application"

  target.build_configurations.each do |config|
    settings = config.build_settings
    settings["PRODUCT_BUNDLE_IDENTIFIER"] = bundle_id
    settings["DEVELOPMENT_TEAM"] = team_id
    settings["CODE_SIGN_STYLE"] = sign_style
    settings["MARKETING_VERSION"] = ENV.fetch("MARKETING_VERSION", settings["MARKETING_VERSION"] || "1.0.0")
    settings["CURRENT_PROJECT_VERSION"] = ENV.fetch("CURRENT_PROJECT_VERSION", ENV.fetch("GITHUB_RUN_NUMBER", settings["CURRENT_PROJECT_VERSION"] || "1"))
    settings["IPHONEOS_DEPLOYMENT_TARGET"] = "14.0"
    settings["ENABLE_USER_SCRIPT_SANDBOXING"] = "NO"
    settings["CODE_SIGNING_ALLOWED"] = "YES"
    settings["CODE_SIGNING_REQUIRED"] = "YES"

    if sign_style.to_s.downcase == "manual"
      settings["CODE_SIGN_IDENTITY"] = sign_identity.to_s.empty? ? "Apple Distribution" : sign_identity
      settings["CODE_SIGN_IDENTITY[sdk=iphoneos*]"] = settings["CODE_SIGN_IDENTITY"]
      if profile_spec && !profile_spec.empty?
        settings["PROVISIONING_PROFILE_SPECIFIER"] = profile_spec
      end
    else
      settings.delete("PROVISIONING_PROFILE_SPECIFIER")
      settings.delete("PROVISIONING_PROFILE")
      settings.delete("CODE_SIGN_IDENTITY[sdk=iphoneos*]")
      settings["CODE_SIGN_IDENTITY"] = ""
    end

    if is_app
      settings["SKIP_INSTALL"] = "NO"
      settings["INSTALL_PATH"] = "$(LOCAL_APPS_DIR)"
    end
  end
end

project.build_configurations.each do |config|
  config.build_settings["DEVELOPMENT_TEAM"] = team_id
  config.build_settings["CODE_SIGN_STYLE"] = sign_style
  config.build_settings["ENABLE_USER_SCRIPT_SANDBOXING"] = "NO"
end

project.save
puts "Configured #{proj_path}: bundle=#{bundle_id} team=#{team_id} style=#{sign_style} profile=#{profile_spec}"
